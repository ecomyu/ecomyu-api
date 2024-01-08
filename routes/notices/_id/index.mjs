import { IsBoolean, IsNumber, Clone, FilterData, CurrentUser, AdUsers, ValidateData, RecursiveEach, RecursivePosts, AutoTags, SaveFile, LoadFile } from "../../../lib.mjs"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

import reallyRelaxedJson from 'really-relaxed-json'
const { toJson } = reallyRelaxedJson

dayjs.extend(utc)
dayjs.locale('ja')

const schema = {
  action: 1,
  postId: 1,
  saw: 1
}

const userSchema = {
  id: 1,
  handle: 1,
  bgColor: 1,
  bgId: 1,
  avatarColor: 1,
  avatarId: 1,
  deleted: 1
}

const postSchema = {
  // parentId: 1,
  // postId: 1,
  text: 1,
  // files: 1
}

const postRules = {
  text: {
    required: true,
    maxLength: 2000,
    isHTML: true
  }
}

export default async function (fastify, opts) {
  fastify.get('/', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      ret._id = req.params.id

      let notice = await fastify.mongo.db
        .collection('Notices')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          deleted: { $ne: true }
        })
      if (!notice) {
        throw new Error('Not Found Notice')
      }

      if (notice.deleted) {
        ret.deleted = true
      } else {
        ret = FilterData(notice, schema)
      }

      if (notice.postedBy) {
        const user = await fastify.mongo.db
          .collection('Users')
          .findOne({
            _id: notice.postedBy,
            // deleted: { $ne: true }
          })

        ret.PostedBy = {
          _id: notice.postedBy
        }

        if (user) {
          if (user.deleted) {
            ret.PostedBy.id = user.id
            ret.PostedBy.deleted = true

            ret.deleted = true
          } else {
            ret.PostedBy = FilterData(user, userSchema)

            ret.PostedBy.active = user.joined && dayjs().diff(user.latestJoinedAt, 'second') < 300
          }
        } else {
          ret.hidden = true
          ret.deleted = true
        }
      }

      if (notice.postId) {
        let post = await fastify.mongo.db
          .collection('Posts')
          .findOne({
            _id: notice.postId,
            // deleted: { $ne: true }
          })

        if (post) {
          ret.Post = FilterData(post, postSchema)
        } else {
          ret.hidden = true
          ret.deleted = true
        }
      }
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  })
}
