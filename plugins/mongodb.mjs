import fastifyPlugin from 'fastify-plugin'

import fastifyMongo from '@fastify/mongodb'

export default fastifyPlugin(function (fastify, opts, done) {
  const DB_URI = process.env.DB_URI

  try {
    fastify.register(fastifyMongo, {
      forceClose: true,
      url: process.env.DB_URI
    })
  } catch(e) {
    console.log(e)
  }
  done()
})
