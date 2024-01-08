import { IsBoolean, IsNumber, CurrentUser, RecursiveEach } from "../../lib.mjs"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

import reallyRelaxedJson from 'really-relaxed-json'
const { toJson } = reallyRelaxedJson

dayjs.extend(utc)
dayjs.locale('ja')

export default async function (fastify, opts) {
  fastify.get('/', async function (req, reply) {
    let data = []

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      let matches = {
        $and: [
          { to: currentUser._id },
          { deleted: { $ne: true } }
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

      if (req.query.notsaw) {
        matches.$and.push({ saw: { $ne: true } })
      }

      aggregate.push({
        $project: {
          _id: 1,
          postedAt: 1
        }
      })

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
      if (skip > 0) {
        aggregate.push({ $skip: skip })
      }

      let limit = 100
      if (req.query.limit) {
        limit = Number(req.query.limit)
      }
      if (limit !== -1) {
        aggregate.push({ $limit: limit })
      }

      const notices = await fastify.mongo.db
        .collection('Notices')
        .aggregate(aggregate)
        .toArray()

      let post, user

      for (let notice of notices) {
        /*
        let isDeleted = false

        if (notice.postId) {
          post = await fastify.mongo.db
            .collection('Posts')
            .findOne({
              _id: notice.postId,
              deleted: { $ne: true }
            }
          )
          if (!post) {
            isDeleted = true
          }
        }
        if (!isDeleted && notice.postedAt) {
          user = await fastify.mongo.db
            .collection('Users')
            .findOne({
              _id: notice.postedAt,
              deleted: { $ne: true }
            }
          )
          if (!user) {
            isDeleted = true
          }
        }

        if (!isDeleted) {
          // data.push(notice)
        }
        */
        data.push(notice)
      }

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return data
  }),
  fastify.get('/count', async function (req, reply) {
    let count = 0

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      let matches = {
        $and: [
          { to: currentUser._id },
          { deleted: { $ne: true } }
        ]
      }

      if (req.query.notsaw) {
        matches.$and.push({ saw: { $ne: true } })
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

      aggregate.push({
        $count: 'count'
      })

      const arr = await fastify.mongo.db
        .collection('Notices')
        .aggregate(aggregate)
        .toArray()
      if (arr.length > 0 && arr[0] && arr[0].count) {
        count = arr[0].count
      }

    } catch (err) {
      console.error(err)
    }

    return count
  })
}
