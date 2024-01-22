import { IsBoolean, IsNumber, Clone, FilterData, CurrentUser, ValidateData, RecursiveEach } from "../../../../lib.mjs"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

import reallyRelaxedJson from 'really-relaxed-json'
const { toJson } = reallyRelaxedJson

dayjs.extend(utc)
dayjs.locale('ja')

const getRules = {
  id: {
    required: true,
    minLength: 1,
    maxLength: 20,
    // regex: /^[a-z][0-9a-z_]+[0-9a-z]$/
  }
}

export default async function (fastify, opts) {
  fastify.get('/', async (req, reply) => {
    let ret = []

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      }

      const [isValid, incorrects, params] = ValidateData(req.params, getRules)
      if (!isValid) {
        throw new Error(`Incorrect Parameters - ${incorrects.join(',')}`)
      }

      let user = await fastify.mongo.db
        .collection('Users')
        .findOne({
          id: req.params.id,
          deleted: { $ne: true }
        })
      if (!user) {
        throw new Error('Not Found User')
      }

      let matches = {
        $and: [
          { postedBy: user._id }
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

        matches.$and.push(queryFilter)
      }

      let aggregate = [
        {
          $match: matches
        }, {
          $project: {
            _id: 1,
            postedAt: 1,
            postedBy: 1,
            deleted: 1
          }
        }
      ]

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

      ret = await fastify.mongo.db
        .collection('Posts')
        .aggregate(aggregate)
        .toArray()
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.get('/count', async (req, reply) => {
    let ret = 0

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      }

      const [isValid, incorrects, params] = ValidateData(req.params, getRules)
      if (!isValid) {
        throw new Error(`Incorrect Parameters - ${incorrects.join(',')}`)
      }

      let user = await fastify.mongo.db
        .collection('Users')
        .findOne({
          id: req.params.id,
          deleted: { $ne: true }
        })
      if (!user) {
        throw new Error('Not Found User')
      }

      ret = await fastify.mongo.db
        .collection('Posts')
        .find({
          postedBy: user._id,
        })
        .count()

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  })
}
