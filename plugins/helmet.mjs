import fastifyPlugin from 'fastify-plugin'

import Helmet from '@fastify/helmet'

export default fastifyPlugin(function (fastify, opts, done) {
  const policy = process.env.REFERRER_POLICY || 'same-origin'

  fastify.register(Helmet, {
    referrerPolicy: {
      policy: policy
    }
  })

  done()
})
