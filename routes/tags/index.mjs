import { IsBoolean, IsNumber, Clone, EscapeRegex, CurrentUser, AdUsers, BlockUsers, ValidateData, RecursiveEach, AutoTags } from "../../lib.mjs"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

import reallyRelaxedJson from 'really-relaxed-json'
const { toJson } = reallyRelaxedJson

dayjs.extend(utc)
dayjs.locale('ja')

const schema = {
  text: 1
}

export default async function (fastify, opts) {
  fastify.get('/', async (req, reply) => {
    let data = []

    try {
      let matches = {
        $and: [
          { deleted: { $ne: true } }
        ]
      }

      if (req.query.text === undefined) {
        throw new Error('Lack Of Parameters')
      } else if (req.query.text) {
        matches.$and.push(  { text: { $regex: '^' + EscapeRegex(req.query.text) } })
      }

      let aggregate = [
        {
          $match: matches
        }, {
          $project: {
            _id: 1,
            text: 1,
            postedAt: 1
          }
        }
      ]

      let sort = {}
      if (req.query.sort) {
        for (let field of req.query.sort.split(',')) {
          let order = 1
          if (field.substr(0, 1) === '-') {
            field = field.substr(1)
            order = -1
          }
          sort[field] = order
        }
      } else {
        sort = {
          postedAt: -1,
          text: 1
        }
      }
      aggregate.push({ $sort: sort })

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

      const tags = await fastify.mongo.db
        .collection('Tags')
        .aggregate(aggregate)
        .toArray()

      for (let tag of tags) {
        data.push('#' + tag.text)
      }

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return data
  }) //,
  /*
  fastify.get('/count/', async (req, reply) => {
    let count = 0

    try {
      let matches = {
        $and: [
          { deleted: { $ne: true } }
        ]
      }

      if (req.query.text) {
        matches.$and.push(  { text: { $regex: req.query.text } })
      }

      let aggregate = [
        {
          $match: matches
        }
      ]

      aggregate.push({ $count: 'count' })

      const arr = await fastify.mongo.db
        .collection('Tags')
        .aggregate(aggregate)
        .toArray()
      if (arr.length > 0 && arr[0] && arr[0].count) {
        count = arr[0].count
      }
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return count
  })
  */
}
