import { CurrentUser } from "../../../lib.mjs"

export default async function (fastify, opts) {
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
          { postedBy: currentUser._id },
          { deleted: { $ne: true } }
        ]
      }

      let aggregate = [
        {
          $match: matches
        }, {
          $count: 'count'
        }
      ]

      const arr = await fastify.mongo.db
        .collection('Posts')
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
