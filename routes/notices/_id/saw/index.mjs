import { CurrentUser } from "../../../../lib.mjs"

export default async function (fastify, opts) {
  fastify.post('/', async (req, reply) => {
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
        .collection('Notices')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          deleted: { $ne: true }
        })

      if (!data) {
        throw new Error('Not Found Notice')
      }

      await fastify.mongo.db
        .collection('Notices')
        .updateOne({
          _id: data._id,
        }, {
          $set: {
            saw: true
          }
        })

      ret._id = data._id

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  })
}
