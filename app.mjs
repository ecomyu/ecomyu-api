import path from 'path'
import { fileURLToPath } from 'url'

import autoload from '@fastify/autoload'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default function (fastify, opts, done) {
  fastify.register(autoload, {
    dir: path.join(__dirname, 'plugins'),
    options: {}
  })

  fastify.register(autoload, {
    dir: path.join(__dirname, 'routes'),
    routeParams: true,
    options: {
      recursive: true,
      prefix: process.env.PREFIX ? process.env.PREFIX : '/'
    }
  })

  done()
}
