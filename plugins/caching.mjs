import fastifyPlugin from 'fastify-plugin'

import Caching from '@fastify/caching'

export default fastifyPlugin(function (fastify, opts, done) {
  fastify.register(Caching, {
    privacy: Caching.privacy.NOCACHE
  }, (err) => {
    if (err) throw err
  })

  done()
})
