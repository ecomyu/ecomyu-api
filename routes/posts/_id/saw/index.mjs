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

      const post = await fastify.mongo.db
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          deleted: { $ne: true }
        })

      if (!post) {
        throw new Error('Not Found Post')
      }

      const upserted = await fastify.mongo.db
        .collection('Saws')
        .updateOne({
          postId: post._id,
          userId: currentUser._id
        }, {
          $setOnInsert: {
            sawAt: new Date()
          }
        }, {
          upsert: true
        })

      /*
      if (upserted && upserted.upsertedId) {
        ret._id = upserted.upsertedId
      }
      */

      ret._id = post._id

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  })
}
