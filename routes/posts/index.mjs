import { IsBoolean, IsNumber, Clone, CurrentUser, AdUsers, BlockUsers, Followers, ValidateData, RecursiveEach, AutoTags, GenerateNotice } from "../../lib.mjs"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

import reallyRelaxedJson from 'really-relaxed-json'
const { toJson } = reallyRelaxedJson

dayjs.extend(utc)
dayjs.locale('ja')

const schema = {
  parentId: 1,
  text: 1
}

const postRules = {
  text: {
    // required: true,
    maxLength: 2000,
    isHTML: true
  }
}

export default async function (fastify, opts) {
  fastify.get('/', async (req, reply) => {
    let data = []

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
      }

      let matches = {
        $and: [
          { parentId: { $exists: false } },
          // { deleted: { $ne: true } }
        ]
      }

      const adUsers = await AdUsers(fastify)

      if (adUsers.length > 0) {
        matches.$and.push({ postedBy: { $nin: adUsers } })
      }

      let currentUser
      let blockUsers
      if (email) {
        currentUser = await CurrentUser(fastify, email)
        if (currentUser) {
          blockUsers = await BlockUsers(fastify, currentUser)
        }
      }

      if (currentUser && blockUsers && blockUsers.length > 0) {
        matches.$and.push({ postedBy: { $nin: blockUsers } })
      }

      if (req.query.filter && req.query.filter !== '') {
        let queryFilter = JSON.parse(toJson(req.query.filter))

        RecursiveEach(queryFilter, (key, value) => {
          if (value === null) {
            return null
          } else if (IsBoolean(value)) {
            return value
          } else if (IsNumber(value)) {
            return value
          } else if (value.match(/^Date:\(\'(.+)\'\)$/)) {
            return dayjs(RegExp.$1).toDate()
          } else if (value.match(/^ObjectId:\(\'(.+)\'\)$/)) {
            return new fastify.mongo.ObjectId(RegExp.$1, 'g')
          } else {
            return null
          }
        })

        matches.$and.push(queryFilter)
      }

      let aggregate = [
        {
          $match: matches
        }, {
          $project: {
            _id: 1,
            parentId: 1,
            // text: 1,
            postedAt: 1
          }
        }
      ]

      /*
      let aggregate = [
        {
          $match: matches
        }, {
          $lookup: {
            from: 'Users',
            localField: 'postedBy',
            foreignField: '_id',
            as: 'PostedBy'
          }
        }, {
          $unwind: {
            path: '$PostedBy',
            preserveNullAndEmptyArrays: true
          }
        }
      ]

      aggregate.push({
        $project: Object.assign({
          _id: 1,
          postedAt: 1,
          // postedBy: 1,
          'PostedBy._id': 1,
          'PostedBy.id': 1,
          'PostedBy.handle': 1,
          'PostedBy.avatarId': 1,
          'PostedBy.color': 1,
          'PostedBy.deleted': 1,
        }, schema)
      })
      */

      if (req.query.sort) {
        let sort = {}
        for (let field of req.query.sort.split(',')) {
          let order = 1
          if (field.substr(0, 1) === '-') {
            field = field.substr(1)
            order = -1
          }
          sort[field] = order
        }
        aggregate.push({ $sort: sort })
      }

      let skip = 0
      if (req.query.skip) {
        skip = Number(req.query.skip)
      }
      let adCount = 0
      if (adUsers.length > 0) {
        adCount = await fastify.mongo.db
          .collection('Posts')
          .find({
            $and: [
              { parentId: { $exists: false } },
              { postedBy: { $in: adUsers } },
              { deleted: { $ne: true } }
            ]
          })
          .count()
      }
      if (adUsers.length > 0 && adCount > 0 && skip > 0) {
        skip--
      }
      if (skip > 0) {
        aggregate.push({ $skip: skip })
      }
      let limit = 100
      if (req.query.limit) {
        limit = Number(req.query.limit)
      }
      if (adUsers.length > 0 && adCount > 0 && limit !== -1) {
        limit--
      }
      if (limit !== -1) {
        aggregate.push({ $limit: limit })
      }

      data = await fastify.mongo.db
        .collection('Posts')
        .aggregate(aggregate)
        .toArray()

      if (adUsers.length > 0 && adCount > 0) {
        const adOffset = Math.floor(Math.random() * adCount)

        const adPosts = await fastify.mongo.db
          .collection('Posts')
          .find({
            $and: [
              { parentId: { $exists: false } },
              { postedBy: { $in: adUsers } },
              { deleted: { $ne: true } }
            ]
          })
          .skip(adOffset)
          .toArray()

        if (adPosts.length > 0) {
          let adData = {
            _id: adPosts[0]._id,
            postedAt: adPosts[0].postedAt,
            isAd: true
          }

          if (adPosts[0].parentId) {
            adData.parentId = adPosts[0].parentId
          }

          data.unshift(adData)
        }
      }

      /*
      if (req.query.fields && req.query.fields !== '') {
        let temp = await fastify.mongo.db
          .collection('Posts')
          .aggregate(aggregate)
          .toArray()
        data = temp.map((hash) => {
          let newHash = {
            _id: hash._id
          }
          for (let field of req.query.fields.split(',')) {
            if (hash[field] !== undefined) {
              newHash[field] = hash[field]
            }
          }
          return newHash
        })
      } else {
        data = await fastify.mongo.db
          .collection('Posts')
          .aggregate(aggregate)
          .toArray()
      }
      */
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return data
  }),
  fastify.get('/count', async (req, reply) => {
    let count = 0

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
      }

      let matches = {
        $and: [
          { parentId: { $exists: false } },
          // { deleted: { $ne: true } }
        ]
      }

      const adUsers = await AdUsers(fastify)

      if (adUsers.length > 0) {
        matches.$and.push({ postedBy: { $nin: adUsers } })
      }

      let currentUser
      let blockUsers
      if (email) {
        currentUser = await CurrentUser(fastify, email)
        if (currentUser) {
          blockUsers = await BlockUsers(fastify, currentUser)
        }
      }

      if (currentUser && blockUsers && blockUsers.length > 0) {
        matches.$and.push({ postedBy: { $nin: blockUsers } })
      }

      if (req.query.filter && req.query.filter !== '') {
        let queryFilter = JSON.parse(toJson(req.query.filter))

        RecursiveEach(queryFilter, (key, value) => {
          if (value === null) {
            return null
          } else if (IsBoolean(value)) {
            return value
          } else if (IsNumber(value)) {
            return value
          } else if (value.match(/^Date:\(\'(.+)\'\)$/)) {
            return dayjs(RegExp.$1).toDate()
          } else if (value.match(/^ObjectId:\(\'(.+)\'\)$/)) {
            return new fastify.mongo.ObjectId(RegExp.$1, 'g')
          } else {
            return null
          }
        })

        matches.$and.push(queryFilter)
      }

      let aggregate = [
        {
          $match: matches
        }
      ]

      aggregate.push({ $count: 'count' })

      const arr = await fastify.mongo.db
        .collection('Posts')
        .aggregate(aggregate)
        .toArray()
      if (arr.length > 0 && arr[0] && arr[0].count) {
        count = arr[0].count
      }

      if (adUsers.length > 0) {
        const adCount = await fastify.mongo.db
          .collection('Posts')
          .find({
            $and: [
              { parentId: { $exists: false } },
              { postedBy: { $in: adUsers } },
              { deleted: { $ne: true } }
            ]
          })
          .count()

        if (adCount > 0) {
          count += 1
        }
      }
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return count
  }),
  fastify.post('/', async function (req, reply) {
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

      if (!req.body) {
        throw new Error('Empty Body')
      }

      const [isValid, incorrects, data] = ValidateData(req.body, postRules)
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

      data.postedBy = currentUser._id
      data.postedAt = new Date()

      const inserted = await fastify.mongo.db
        .collection('Posts')
        .insertOne(data)

      data._id = inserted.insertedId

      const toUserIds = await Followers(fastify, currentUser)
      await GenerateNotice(fastify, req, 'post', currentUser._id, toUserIds, data._id)

      ret = Object.assign({}, data)
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  /*
  fastify.delete('/:id', async (req, reply) => {
  }),
  fastify.get('/:id/likes/count', async (req, reply) => {
    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      const data = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          // deleted: { $ne: true }
        })

      if (!data) {
        throw new Error('Not Found Data')
      }

      let likesMatches = {
        $and: [
          { announcementId: new fastify.mongo.ObjectId(req.params.id) },
          // { deleted: { $ne: true } }
        ]
      }

      if (req.query.filter && req.query.filter !== '') {
        let queryFilter = JSON.parse(toJson(req.query.filter))

        RecursiveEach(queryFilter, (key, value) => {
          if (value === null) {
            return null
          } else if (IsBoolean(value)) {
            return value
          } else if (IsNumber(value)) {
            return value
          } else if (value.match(/^Date:\(\'(.+)\'\)$/)) {
            return dayjs(RegExp.$1).toDate()
          } else if (value.match(/^ObjectId:\(\'(.+)\'\)$/)) {
            return new fastify.mongo.ObjectId(RegExp.$1, 'g')
          } else if (value.match(/^RegExp:\(\'(.+)\'\)$/)) {
            return new RegExp(RegExp.$1, 'g')
          } else {
            return null
          }
        })

        likesMatches.$and.push(queryFilter)
      }

      let likesAggregate = [
        {
          $match: likesMatches
        }, {
          $count: 'count'
        }
      ]

      let count = 0
      const arr = await fastify.mongo.db
        .collection('Likes')
        .aggregate(likesAggregate)
        .toArray()
      if (arr.length > 0 && arr[0] && arr[0].count) {
        count = arr[0].count
      }

      reply
        .send(count)
    } catch (err) {
      console.error(err)
      throw boom.boomify(err)
    }
  }),
  fastify.post('/:id/likes', async (req, reply) => {
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

      const data = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          // deleted: { $ne: true }
        })

      if (!data) {
        throw new Error('Not Found Data')
      }

      const upserted = await fastify.mongo.db
        .collection('Likes')
        .updateOne({
          announcementId: new fastify.mongo.ObjectId(req.params.id),
          userId: currentUser._id,
        }, {
          $setOnInsert: {
            likedAt: new Date()
          }
        }, {
          upsert: true
        })

      if (upserted && upserted.upsertedId) {
        ret._id = upserted.upsertedId
      }

      const members = await GetGroupsMembers(fastify, data.permitGroups, members)

      await GenerateBackgroundNotice(fastify, req, currentUser, members, {
        action: 'like',
        type: 'announcement',
        _id: data._id,
        postedAt: new Date(),
        postedBy: currentUser._id
      })
    } catch (err) {
      console.error(err)
      throw boom.boomify(err)
    }

    reply
      // .type('application/json; charset=utf-8')
      .send(ret)
  }),
  fastify.delete('/:id/likes', async (req, reply) => {
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

      const data = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          // deleted: { $ne: true }
        })

      if (!data) {
        throw new Error('Not Found Data')
      }

      const deleted = await fastify.mongo.db
        .collection('Likes')
        .deleteOne({
          announcementId: new fastify.mongo.ObjectId(req.params.id),
          userId: currentUser._id
        })

      // ret._id = deleted.deletedId

      const members = await GetGroupsMembers(fastify, data.permitGroups, members)

      await GenerateBackgroundNotice(fastify, req, currentUser, members, {
        action: 'dislike',
        type: 'announcement',
        _id: data._id,
        postedAt: new Date(),
        postedBy: currentUser._id
      })
    } catch (err) {
      console.error(err)
      throw boom.boomify(err)
    }

    reply
      // .type('application/json; charset=utf-8')
      .send(ret)
  })
  */
  {}
}
