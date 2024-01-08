import fastifyPlugin from 'fastify-plugin'

import Cors from '@fastify/cors'

export default fastifyPlugin(function (fastify, opts, done) {
  const origin = process.env.CLIENT_ORIGIN || '*'

  fastify.register(Cors, {
    origin: origin
  })

  done()
})
