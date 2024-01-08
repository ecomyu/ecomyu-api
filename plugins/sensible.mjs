import fastifyPlugin from 'fastify-plugin'

import Sensible from '@fastify/sensible'

export default fastifyPlugin(function (fastify, opts, done) {
  fastify.register(Sensible, {
    errorHandler: false
  })

  done()
})
