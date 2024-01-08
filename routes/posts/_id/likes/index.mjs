import { CurrentUser, GenerateNotice, EmitBackgroundNotice } from "../../../../lib.mjs"

export default async function (fastify, opts) {
  fastify.get('/count', async (req, reply) => {
    let ret = null

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
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

      ret = 0
      const arr = await fastify.mongo.db
        .collection('Likes')
        .aggregate([
          {
            $match:  {
              $and: [
                { postId: post._id },
                { deleted: { $ne: true } }
              ]
            }
          }, {
            $count: 'count'
          }
        ])
        .toArray()
      if (arr.length > 0 && arr[0] && arr[0].count) {
        ret = arr[0].count
      }
    } catch (err) {
      console.error(err)
      throw boom.boomify(err)
    }

    return ret
  }),
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
        .collection('Posts')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          deleted: { $ne: true }
        })

      if (!data) {
        throw new Error('Not Found Data')
      }

      const upserted = await fastify.mongo.db
        .collection('Likes')
        .updateOne({
          postId: new fastify.mongo.ObjectId(req.params.id),
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

      const toUserIds = [data.postedBy]
      await GenerateNotice(fastify, req, 'like', currentUser._id, toUserIds, data._id)

      await EmitBackgroundNotice(fastify,
        'liked',
        {
          postId: new fastify.mongo.ObjectId(req.params.id),
          userId: currentUser._id
        }
      )

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
          postId: new fastify.mongo.ObjectId(req.params.id),
          userId: currentUser._id
        })

      // ret._id = deleted.deletedId
      await EmitBackgroundNotice(fastify,
        'unliked',
        {
          postId: new fastify.mongo.ObjectId(req.params.id),
          userId: currentUser._id
        }
      )

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  })
}
