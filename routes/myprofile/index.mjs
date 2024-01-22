import randomstring from 'randomstring'

import { Clone, Shuffle, FilterData, CurrentUser, ValidateData, ExtractChangedData, AutoTags, LoadFile, SaveFile, ExistsFile, DeleteFile } from "../../lib.mjs"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

dayjs.extend(utc)
dayjs.locale('ja')

const schema = {
  id: 1,
  email: 1,
  handle: 1,
  description: 1,
  url: 1,
  bgColor: 1,
  bgId: 1,
  avatarColor: 1,
  avatarId: 1,
}

const postRules = {
  handle: {
    required: true,
    maxLength: 20
  },
}

const patchRules = {
  handle: {
    required: true,
    maxLength: 20
  },
  description: {
    maxLength: 2000,
    isHTML: true
  },
  url: {
    maxLength: 2000,
    isURL: true
  },
  bgColor: {},
  avatarColor: {}
}

const patchIdRules = {
  newId: {
    required: true,
    minLength: 1,
    maxLength: 20,
    // regex: /^[a-z][0-9a-z_]+[0-9a-z]$/
  }
}

export default async function (fastify, opts) {
  fastify.get('/', async function (req, reply) {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      ret = FilterData(currentUser, schema)

      ret.active = currentUser.joined && dayjs().diff(currentUser.latestJoinedAt, 'second') < 300

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.post('/', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (currentUser) {
        throw new Error('Exists Email')
      }

      if (!req.body) {
        throw new Error('Empty Body')
      }

      const [isValid, incorrects, data] = ValidateData(req.body, postRules)
      if (!isValid) {
        throw new Error(`Incorrect Parameters - ${incorrects.join(',')}`)
      }

      const user = {
        id: Shuffle((new Date()).getTime().toString(36) + Math.random().toString(36).slice(2)).slice(0, 20),
        handle: data.handle,
        email: email,
      }

      // const added = await fastify.cognito.addUser(fastify, { email: data.email })

      const colorNo = Math.round(Math.random() * 16) + 1

      const inserted = await fastify.mongo.db
        .collection('Users')
        .insertOne({
          id: user.id,
          handle: user.handle,
          email: user.email,
          color: 'user-' + String(colorNo),
          bgColor: 'user-' + String(colorNo),
          authorized: true,
          postedAt: new Date()
        })

      ret._id = inserted.insertedId

      ret = Object.assign({}, user)
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.patch('/', async (req, reply) => {
    let ret = []

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      if (!req.body) {
        throw new Error('Empty Body')
      }

      const [isValid, incorrects, data] = ValidateData(req.body, patchRules)
      if (!isValid) {
        throw new Error(`Incorrect Parameters - ${incorrects.join(',')}`)
      }

      const tags = AutoTags(data.description)

      if (tags.length > 0) {
        data.tags = tags
      }

      const changedData = ExtractChangedData(data, currentUser)
      if (Object.keys(changedData).length === 0) {
        throw new Error('Not Changed Data')
      }
      const appendData = {
        patchedAt: new Date(),
        patchedBy: currentUser._id
      }

      const updated = await fastify.mongo.db
        .collection('Users')
        .updateOne({
          _id: currentUser._id
        },
        {
          $set: Object.assign(changedData, appendData)
        })

      ret = Object.assign({}, changedData)
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.delete('/', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      const deleted = await fastify.cognito.deleteUser(fastify, { email: currentUser.email })
      if (!deleted) {
        throw new Error(`Failed To Delete`)
      }

      await fastify.mongo.db
        .collection('Users')
        .updateOne({
          _id: currentUser._id
        }, {
          $set: {
            deleted: true,
            deletedAt: new Date(),
            deletedBy: currentUser._id
          }
        })

      ret._id = currentUser._id
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.patch('/id', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      if (!req.body) {
        throw new Error('Empty Body')
      }

      const [isValid, incorrects, data] = ValidateData(req.body, patchIdRules)
      if (!isValid) {
        throw new Error(`Incorrect Parameters - ${incorrects.join(',')}`)
      }

      await fastify.mongo.db
        .collection('Users')
        .updateOne(
          {
            _id: currentUser._id,
            // deleted: { $ne: true }
          }, {
            $set: {
              id: data.newId
            }
          }
        )

      ret = true

    } catch (e) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.post('/bg', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      if (currentUser.bgId) {
        const oldFile = await fastify.mongo.db
          .collection('Files')
          .findOne({
            userId: currentUser._id,
            _id: new fastify.mongo.ObjectId(currentUser.bgId),
            // extension: fileExt,
            deleted: { $ne: true }
          })

        if (oldFile) {
          await fastify.mongo.db
            .collection('Files')
            .updateOne({
              userId: currentUser._id,
              _id: new fastify.mongo.ObjectId(currentUser.bgId),
              // extension: fileExt
            }, {
              $set: {
                deleted: true,
                deletedAt: new Date(),
                deletedBy: currentUser._id
              }
            })

          await DeleteFile(String(currentUser.bgId))
        }
      }

      let fileId = null

      const uploadFiles = await req.files()
      for await (const uploadFile of uploadFiles) {
        const inserted = await fastify.mongo.db
          .collection('Files')
          .insertOne({
            userId: currentUser._id,
            type: 'bg',
            filename: uploadFile.filename,
            encoding: uploadFile.encoding,
            mimetype: uploadFile.mimetype,
            // length: uploadFile.file.length,
            postedBy: currentUser._id,
            postedAt: new Date()
          })

        fileId = inserted.insertedId

        const _bufs = []
        for await (const _buf of uploadFile.file) {
          _bufs.push(_buf)
        }
        const buf = Buffer.concat(_bufs)

        await SaveFile(String(inserted.insertedId), buf, uploadFile.mimetype)
      }

      const updated = await fastify.mongo.db
        .collection('Users')
        .updateOne({
          _id: currentUser._id
        }, {
          $set: {
            bgId: fileId
          }
        })
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.delete('/bg', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      if (!currentUser.bgId) {
        throw new Error('Avatar Not Registered')
      }

      const file = await fastify.mongo.db
        .collection('Files')
        .findOne({
          userId: currentUser._id,
          _id: new fastify.mongo.ObjectId(currentUser.bgId),
          // extension: fileExt
        })

      if (!file) {
        throw new Error('Not Found File')
      }

      ret._id = file._id

      await DeleteFile(String(currentUser.bgId))

      await fastify.mongo.db
        .collection('Files')
        .updateOne({
          userId: currentUser._id,
          _id: new fastify.mongo.ObjectId(currentUser.bgId),
          // extension: fileExt
        }, {
          $set: {
            deleted: true,
            deletedAt: new Date(),
            deletedBy: currentUser._id
          }
        })

      await fastify.mongo.db
        .collection('Users')
        .updateOne({
          _id: currentUser._id
        }, {
          $unset: {
            bgId: ''
          }
        })

      ret.deleted = true

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.post('/avatar', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      if (currentUser.avatarId) {
        const oldFile = await fastify.mongo.db
          .collection('Files')
          .findOne({
            userId: currentUser._id,
            _id: new fastify.mongo.ObjectId(currentUser.avatarId),
            // extension: fileExt,
            deleted: { $ne: true }
          })

        if (oldFile) {
          await fastify.mongo.db
            .collection('Files')
            .updateOne({
              userId: currentUser._id,
              _id: new fastify.mongo.ObjectId(currentUser.avatarId),
              // extension: fileExt
            }, {
              $set: {
                deleted: true,
                deletedAt: new Date(),
                deletedBy: currentUser._id
              }
            })

          await DeleteFile(String(currentUser.avatarId))
        }
      }

      let fileId = null

      const uploadFiles = await req.files()
      for await (const uploadFile of uploadFiles) {
        const inserted = await fastify.mongo.db
          .collection('Files')
          .insertOne({
            userId: currentUser._id,
            type: 'avatar',
            filename: uploadFile.filename,
            encoding: uploadFile.encoding,
            mimetype: uploadFile.mimetype,
            // length: uploadFile.file.length,
            postedBy: currentUser._id,
            postedAt: new Date()
          })

        fileId = inserted.insertedId

        const _bufs = []
        for await (const _buf of uploadFile.file) {
          _bufs.push(_buf)
        }
        const buf = Buffer.concat(_bufs)

        await SaveFile(String(inserted.insertedId), buf, uploadFile.mimetype)
      }

      const updated = await fastify.mongo.db
        .collection('Users')
        .updateOne({
          _id: currentUser._id
        }, {
          $set: {
            avatarId: fileId
          }
        })
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.delete('/avatar', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        throw new Error('Invalid Token')
      }

      const currentUser = await CurrentUser(fastify, email)
      if (!currentUser) {
        throw new Error('Not Found User')
      }

      if (!currentUser.avatarId) {
        throw new Error('Avatar Not Registered')
      }

      const file = await fastify.mongo.db
        .collection('Files')
        .findOne({
          userId: currentUser._id,
          _id: new fastify.mongo.ObjectId(currentUser.avatarId),
          // extension: fileExt
        })

      if (!file) {
        throw new Error('Not Found File')
      }

      ret._id = file._id

      await DeleteFile(String(currentUser.avatarId))

      await fastify.mongo.db
        .collection('Files')
        .updateOne({
          userId: currentUser._id,
          _id: new fastify.mongo.ObjectId(currentUser.avatarId),
          // extension: fileExt
        }, {
          $set: {
            deleted: true,
            deletedAt: new Date(),
            deletedBy: currentUser._id
          }
        })

      await fastify.mongo.db
        .collection('Users')
        .updateOne({
          _id: currentUser._id
        }, {
          $unset: {
            avatarId: ''
          }
        })

      ret.deleted = true

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  })
}
