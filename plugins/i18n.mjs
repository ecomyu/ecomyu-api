import fastifyPlugin from 'fastify-plugin'

import i18n from 'fastify-i18n'
import jaJP from '../i18n/ja-JP/index.mjs'

export default fastifyPlugin(function (fastify, opts, done) {
  fastify.register(i18n, {
    fallbackLocale: 'ja',
    messages: {
      'ja-JP': jaJP
    }
  })

  done()
})
