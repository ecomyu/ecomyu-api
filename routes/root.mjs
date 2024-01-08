import { CurrentUser } from "../lib.mjs"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

dayjs.extend(utc)
dayjs.locale('ja')

export default async function (fastify, opts) {
  fastify.get('/', async function (req, reply) {
    return { root: true }
  })

  fastify.get('/ping', async function (req, reply) {
    return 'pong'
  })

  fastify.get('/echo/:name', async function (req, reply) {
    return { param: req.params.name }
  })

  fastify.get('/db', async function (req, reply) {
    let ret = ''
    try {
      const uri = process.env.DB_URI

      await this.mongo.db.command( { serverStatus: 1 } )
      ret = 'OK'
    } catch (e) {
      ret = 'NG'
    }
    return { status: ret }
  })

  // ns.use(wsAuthMiddleware(fastify))
}
