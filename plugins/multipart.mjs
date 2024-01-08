import fastifyPlugin from 'fastify-plugin'

import Multipart from '@fastify/multipart'

export default fastifyPlugin(function (fastify, opts, done) {
  fastify.register(Multipart, {
    limits: {
      files: 5,
      fileSize: 20 * 1024 * 1024
    }
  })

  done()
})
