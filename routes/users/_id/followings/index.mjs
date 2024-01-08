import { Clone, FilterData, CurrentUser, ValidateData, ExtractChangedData } from "../../../../lib.mjs"

const schema = {
  id: 1,
  // email: 1,
  handle: 1,
  description: 1,
  avatarId: 1,
  color: 1
}

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

      const follows = await fastify.mongo.db
        .collection('Follows')
        .find({
          userId: user._id,
        })
        .sort({
          followedAt: -1
        })
        .toArray()

      for (let follow of follows) {
        let user = await fastify.mongo.db
          .collection('Users')
          .findOne({
            _id: follow.otherUserId,
            deleted: { $ne: true }
          })
        if (user) {
          ret.push(FilterData(user, schema))
        }
      }

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
        .collection('Follows')
        .find({
          userId: user._id,
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
