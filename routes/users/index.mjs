import randomstring from 'randomstring'

import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

import { Clone, FilterData, EscapeRegex, CurrentUser, ValidateData, ExtractChangedData } from "../../lib.mjs"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

dayjs.extend(utc)
dayjs.locale('ja')

const schema = {
  id: 1,
  email: 1,
  handle: 1,
  description: 1,
  bgColor: 1,
  bgId: 1,
  avatarColor: 1,
  avatarId: 1,
}

const getExistsIdRules = {
  id: {
    required: true,
    maxLength: 20,
    regex: /^[a-z][0-9a-z_]+[0-9a-z]$/
  }
}

const getExistsEmailRules = {
  email: {
    required: true,
    email: true
  }
}

const postRequestRules = {
  id: {
    required: true,
    maxLength: 20,
    // regex: /^[a-z][0-9a-z_]+[0-9a-z]$/
  },
  handle: {
    required: true,
    maxLength: 20
  },
  email: {
    required: true,
    email: true
  }
}

const postRegistRules = {
  id: {
    required: true,
    maxLength: 20,
    // regex: /^[a-z][0-9a-z_]+[0-9a-z]$/
  },
  handle: {
    required: true,
    maxLength: 20
  },
  email: {
    required: true,
    email: true
  }
}

const patchRules = {
  handle: {
    required: true,
    maxLength: 20
  },
  description: {
    maxLength: 2000,
    isHTML: true
  },

  color: {}
}

const patchIdRules = {
  newId: {
    required: true,
    minLength: 1,
    maxLength: 20,
    // regex: /^[a-z][0-9a-z_]+[0-9a-z]$/
  }
}

const patchEmailRules = {
  currentEmail: {
    required: true,
    email: true
  },
  newEmail: {
    required: true,
    email: true
  }
}

const postEmailRules = {
  currentEmail: {
    required: true,
    email: true
  },
  randomKey: {
    required: true,
    regex: /^[0-9a-zA-Z]+$/
  }
}

const patchPasswordRules = {
  currentPassword: {
    required: true,
    minLength: 8,
    maxLength: 40
  },
  newPassword: {
    required: true,
    minLength: 8,
    maxLength: 40
  },
  confirmPassword: {
    required: true
  }
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

      if (req.query.id === undefined) {
        throw new Error('Lack Of Parameters')
      } else if (req.query.id) {
        matches.$and.push(  { id: { $regex: '^' + EscapeRegex(req.query.id) } })
      }

      let aggregate = [
        {
          $match: matches
        }, {
          $project: {
            _id: 1,
            id: 1,
            /*
            handle: 1,
            description: 1,
            bgColor: 1,
            bgId: 1,
            avatarColor: 1,
            avatarId: 1,
            latestJoinedAt: 1
            */
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
          latestJoinedAt: -1,
          id: 1,
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

      const users = await fastify.mongo.db
        .collection('Users')
        .aggregate(aggregate)
        .toArray()

      for (let user of users) {
        data.push('@' + user.id)
      }

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return data
  }),
  fastify.get('/exists', async function (req, reply) {
    let ret = false

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      }

      let isValid, incorrects, data
      if (req.query.id) {
        [isValid, incorrects, data] = ValidateData(req.query, getExistsIdRules)
      } else if (req.query.email) {
        [isValid, incorrects, data] = ValidateData(req.query, getExistsEmailRules)
      }

      let filter = {}
      if (req.query.id) {
        filter = {
          _id: {
            $ne: currentUser._id
          },
          id: data.id
        }
      } else if (req.query.email) {
        filter = {
          _id: {
            $ne: currentUser._id
          },
          email: data.email
        }
      }
      filter.deleted = { $ne: true }

      if (req.query.id && !data.id) {
        throw new Error(`Incorrect Parameters - id`)
      } else if (req.query.email && !data.email) {
        throw new Error(`Incorrect Parameters - email`)
      }

      const exists = await fastify.mongo.db
        .collection('Users')
        .findOne(filter)

      if (exists) {
        ret = true
        throw new Error('Exists')
      }
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  })
}
