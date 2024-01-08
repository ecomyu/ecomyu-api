import { IsBoolean, IsNumber, Clone, FilterData, CurrentUser, AdUsers, Followers, ValidateData, RecursiveEach, RecursivePosts, AutoTags, GenerateNotice, EmitBackgroundNotice, SaveFile, LoadFile } from "../../../lib.mjs"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

import reallyRelaxedJson from 'really-relaxed-json'
const { toJson } = reallyRelaxedJson

dayjs.extend(utc)
dayjs.locale('ja')

const schema = {
  parentId: 1,
  postId: 1,
  text: 1,
  viewsCount: 1,
  files: 1
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

const patchRules = {
  text: {
    // required: true,
    maxLength: 2000,
    isHTML: true
  }
}

const ChildrenPosts = async (fastify, _id) => {
  const children = await fastify.mongo.db
    .collection('Posts')
    .find({
      parentId: _id,
      // deleted: { $ne: true }
    })
    .sort({ postedAt: -1 })
    .toArray()

  let ret = []

  for (let child of children) {
    let row = {
      _id: child._id
    }
    let childChildren = await ChildrenPosts(fastify, child._id)
    if (childChildren.length > 0) {
      row.children = childChildren
    }

    ret.push(row)
  }

  return ret
}

export default async function (fastify, opts) {
  fastify.get('/', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      }

      ret._id = req.params.id

      let post = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          // deleted: { $ne: true }
        })
      if (!post) {
        throw new Error('Not Found Post')
      }

      if (post.deleted) {
        ret.deleted = true
      } else {
        await fastify.mongo.db
          .collection('Posts')
          .updateOne({
            _id: post._id,
          }, {
            $inc: {
              viewsCount: 1
            }
          })

        await EmitBackgroundNotice(fastify,
          'viewed',
          {
            postId: new fastify.mongo.ObjectId(req.params.id)
          }
        )

        ret = FilterData(post, schema)
      }

      if (post.postedBy) {
        const user = await fastify.mongo.db
          .collection('Users')
          .findOne({
            _id: post.postedBy,
            // deleted: { $ne: true }
          })

        ret.PostedBy = {
          _id: post.postedBy,
        }

        if (user) {
          if (user.deleted) {
            ret.PostedBy.id = user.id
            ret.PostedBy.deleted = true

            ret.deleted = true
            delete ret.text
            delete ret.files
          } else {
            ret.PostedBy = FilterData(user, userSchema)

            if (currentUser) {
              ret.PostedBy.active = user.joined && dayjs().diff(user.latestJoinedAt, 'second') < 300
            }
          }
        }

        const adUsers = await AdUsers(fastify)
        if (adUsers.length > 0) {
          for (let adUser of adUsers) {
            if (String(adUser) === String(post.postedBy)) {
              ret.isAd = true
              break
            }
          }
        }
      }

      if (post.parentId) {
        ret.parents = []

        ret.parents.push(post.parentId)
        await RecursivePosts(fastify, post.parentId, ret.parents)

        let parent = await fastify.mongo.db
          .collection('Posts')
          .findOne({
            _id: post.parentId,
            // deleted: { $ne: true }
          })
        if (!parent) {
          // throw new Error('Not Found Parent')
          ret.Parent = { deleted: true }
        } else {
          ret.Parent = FilterData(parent, schema)
        }
      }

      if (post.refId) {
        let reference = await fastify.mongo.db
          .collection('Posts')
          .findOne({
            _id: post.refId,
            // deleted: { $ne: true }
          })
        if (!reference) {
          // throw new Error('Not Found Ref')
          ret.Ref = { deleted: true }
        } else {
          ret.Ref = FilterData(reference, schema)
        }
      }

      if (ret.files && !ret.PostedBy.deleted) {
        const filesAggregate = [
          {
            $match: {
              postId: ret._id,
              _id: {
                $in: ret.files
              },
              deleted: { $ne: true }
            }
          }, {
            $project: {
              _id: 1,
              filename: 1,
              mimetype: 1,
              extension: 1,
            }
          }, {
            $sort: {
              postedAt: 1
            }
          }
        ]

        ret.Files = await fastify.mongo.db
          .collection('Files')
          .aggregate(filesAggregate)
          .toArray()

        delete ret.files
      }

      if (currentUser) {
        const saw = await fastify.mongo.db
          .collection('Saws')
          .findOne({
            postId: post._id,
            userId: currentUser._id
          })
        if (saw) {
          ret.saw = true
        }
      }

      if (currentUser) {
        const isLiked = await fastify.mongo.db
          .collection('Likes')
          .findOne({
            postId: post._id,
            userId: currentUser._id,
            deleted: { $ne: true }
          })
        if (isLiked) {
          ret.isLiked = true
        }
      }

      ret.likesCount = await fastify.mongo.db
        .collection('Likes')
        .find({
          postId: post._id,
          deleted: { $ne: true }
        })
        .count()

      if (currentUser) {
        const isReferenced = await fastify.mongo.db
          .collection('Posts')
          .findOne({
            refId: post._id,
            postedBy: currentUser._id,
            deleted: { $ne: true }
          })
        if (isReferenced) {
          ret.isReferenced = true
        }
      }

      ret.referencesCount = await fastify.mongo.db
        .collection('Posts')
        .find({
          refId: post._id,
          deleted: { $ne: true }
        })
        .count()

      if (currentUser) {
        const isCommented = await fastify.mongo.db
          .collection('Posts')
          .findOne({
            parentId: post._id,
            postedBy: currentUser._id,
            deleted: { $ne: true }
          })
        if (isCommented) {
          ret.isCommented = true
        }
      }

      ret.commentsCount = await fastify.mongo.db
        .collection('Posts')
        .find({
          parentId: post._id,
          deleted: { $ne: true }
        })
        .count()

      ret.children = await ChildrenPosts(fastify, post._id)

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.patch('/', async (req, reply) => {
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

      let post = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          // deleted: { $ne: true }
        })
      if (!post) {
        throw new Error('Not Found Post')
      }

      if (!req.body) {
        throw new Error('Empty Body')
      }

      const [isValid, incorrects, data] = ValidateData(req.body, patchRules)
      if (!isValid) {
        throw new Error(`Incorrect Parameters - ${incorrects.join(',')}`)
      }

      if (data.text) {
        const tags = AutoTags(data.text)
        if (tags.length > 0) {
          data.tags = tags

          for (let tag of tags) {
            await fastify.mongo.db
              .collection('Tags')
              .updateOne({
                text: tag,
              }, {
                $set: {
                  text: tag
                },
                $setOnInsert: {
                  postdAt: new Date()
                }
              }, {
                upsert: true
              })
          }
        }
      }

      data.patchedBy = currentUser._id
      data.patchedAt = new Date()

      await fastify.mongo.db
        .collection('Posts')
        .updateOne({
          _id: post._id,
        }, {
          $set: data
        })

      ret._id = post._id
      ret = Object.assign(ret, data)

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.delete('/', async (req, reply) => {
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

      let post = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          // deleted: { $ne: true }
        })
      if (!post) {
        throw new Error('Not Found Post')
      }

      let dataSet = {
        _text: post.text,
        deleted: true,
        deletedAt: new Date(),
        deletedBy: currentUser._id
      }

      let dataUnset = {
        text: ''
      }

      if (post.refId) {
        dataSet._refId = post.refId
        dataUnset.refId = ''
      }

      await fastify.mongo.db
        .collection('Posts')
        .updateOne({
          _id: post._id,
        }, {
          $set: dataSet,
          $unset: dataUnset
        })

        ret._id = post._id
        ret.deleted = true

      await EmitBackgroundNotice(fastify,
        'deleted',
        {
          postId: post._id,
          userId: currentUser._id
        }
      )

      if (post.refId || post.parentId) {
        let emitAction
        let emitPostId
        if (post.refId) {
          emitAction = 'unreferenced'
          emitPostId = post.refId
        } else if (post.parentId) {
          emitAction = 'uncommented'
          emitPostId = post.parentId
        }

        await EmitBackgroundNotice(fastify,
          emitAction,
          {
            postId: emitPostId,
            userId: currentUser._id
          }
        )
      }

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.post('/upload', async (req, reply) => {
    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      let post = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          // deleted: { $ne: true }
        })
      if (!post) {
        throw new Error('Not Found Post')
      }

      let files = []
      if (post.files) {
        files = post.files.concat()
      }

      const uploadFiles = await req.files()

      for await (const uploadFile of uploadFiles) {
        const inserted = await fastify.mongo.db
          .collection('Files')
          .insertOne({
            postId: post._id,
            filename: uploadFile.filename,
            encoding: uploadFile.encoding,
            mimetype: uploadFile.mimetype,
            // length: uploadFile.file.length,
            postedBy: currentUser._id,
            postedAt: new Date()
          })

        files.push(inserted.insertedId)

        const _bufs = []
        for await (const _buf of uploadFile.file) {
          _bufs.push(_buf)
        }
        const buf = Buffer.concat(_bufs)

        await SaveFile(String(inserted.insertedId), buf, uploadFile.mimetype)
      }

      const updated = await fastify.mongo.db
        .collection('Posts')
        .updateOne({
          _id: post._id
        },
        {
          $set: {
            files: files
          }
        })

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
    }

    return
  }),
  fastify.get('/files/:fileId', async (req, reply) => {
    let _id = null

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      }

      let post = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          // deleted: { $ne: true }
        })
      if (!post) {
        throw new Error('Not Found Post')
      }

      const file = await fastify.mongo.db
        .collection('Files')
        .findOne({
          postId: post._id,
          _id: new fastify.mongo.ObjectId(req.params.fileId),
          // extension: fileExt
        })

      if (!file) {
        throw new Error('Not Found File')
      }

      let mimetype = file.mimetype
      let filename = file.filename

      let avatarId
      if (file.mimetype === 'image/heic') {
        mimetype = 'image/jpeg'
        if (file.filename.match(/\.heic/)) {
          filename = file.filename.replace(/.heic/, '.jpg')
        } else {
          filename = file.filename + '.jpg'
        }

        if (file.alternateId) {
          avatarId = file.alternateId
        } else {
          avatarId = await ConvertImage(fastify, file, 'alternate')
        }
      } else {
        avatarId = file._id
      }

      const buf = await LoadFile(String(avatarId))

      reply
        .header('Content-Type', mimetype)
        .header('Content-Disposition', `attachment;filename="${encodeURI(filename)}"`)
        .send(buf)

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
    }

    return
  }),
  /*
  fastify.get('/:id/files/:fileId/thumbnail', async (req, reply) => {
  }),
  */
  /*
  fastify.delete('/:id/files/:fileId', async (req, reply) => {
    let _id = null

    let files = []

    try {
      const currentTeam = await CurrentTeam(fastify, req.headers)
      if (!currentTeam) {
        throw new Error('Not Found Team')
      }

      const token = await CheckLoggedin(fastify, req.headers, currentTeam)
      if (!token) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, req.headers, currentTeam, token.email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      const data = await fastify.db
        .collection(collection)
        .findOne({
          teamId: currentTeam._id,
          _id: new ObjectId(req.params.id),
          deleted: { $ne: true }
        })

      if (!data) {
        throw new Error('Not Found Data')
      }

      if (String(data.postedBy) !== String(currentUser._id)) {
        throw new Error('Not Your Data')
      }

      const _id = data._id

      if (data.files.length > 0) {
        for (const file of data.files) {
          files.push(file)
        }
      }

      const file = await fastify.db
        .collection('Files')
        .findOne({
          teamId: currentTeam._id,
          announcementId: _id,
          _id: new ObjectId(req.params.fileId),
          // extension: fileExt
        })

      if (!file) {
        throw new Error('Not Found File')
      }

      await DeleteFile(String(req.params.fileId))

      await fastify.db
        .collection('Files')
        .updateOne({
          teamId: currentTeam._id,
          announcementId: _id,
          _id: new ObjectId(req.params.fileId),
          // extension: fileExt
        }, {
          $set: {
            deleted: true,
            deletedAt: new Date(),
            deletedBy: currentUser._id
          }
        })

      const newFiles = files.filter((fileId) => {
        return String(fileId) !== String(req.params.fileId)
      })

      await fastify.db
        .collection(collection)
        .updateOne(
          {
            _id: _id
          }, {
            $set: {
              files: newFiles
            }
          })

      reply
        .send()
    } catch (err) {
      console.error(err)
      throw boom.boomify(err)
    }
  }),
  */
  fastify.get('/isLiked', async (req, reply) => {
    let ret = false

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
        return false
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      } else {
        return false
      }

      if (!currentUser) {
        return false
      }

      const post = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          deleted: { $ne: true }
        })

      if (!post) {
        throw new Error('Not Found Post')
      }

      const isLiked = await fastify.mongo.db
        .collection('Likes')
        .findOne({
          postId: post._id,
          userId: currentUser._id,
        })
      if (isLiked) {
        ret = true
      }
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.get('/isReferenced', async (req, reply) => {
    let ret = false

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
        return false
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      } else {
        return false
      }

      if (!currentUser) {
        return false
      }

      const post = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          deleted: { $ne: true }
        })

      if (!post) {
        throw new Error('Not Found Post')
      }

      const isReferenced = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          refId: post._id,
          postedBy: currentUser._id,
        })

      if (isReferenced) {
        ret = true
      }
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.get('/isCommented', async (req, reply) => {
    let ret = false

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
        return false
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      } else {
        return false
      }

      if (!currentUser) {
        return false
      }

      const post = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          deleted: { $ne: true }
        })

      if (!post) {
        throw new Error('Not Found Post')
      }

      const isCommented = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          parentId: post._id,
          postedBy: currentUser._id
        })

      if (isCommented) {
        ret = true
      }
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  })
}
