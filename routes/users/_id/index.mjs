import { Clone, FilterData, CurrentUser, Followers, ValidateData, ExtractChangedData, GenerateNotice, LoadFile, ExistsFile, /* ConvertImage */ } from "../../../lib.mjs"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

dayjs.extend(utc)
dayjs.locale('ja')

const schema = {
  id: 1,
  // email: 1,
  handle: 1,
  description: 1,
  url: 1,
  bgColor: 1,
  bgId: 1,
  avatarColor: 1,
  avatarId: 1
}

const getRules = {
  id: {
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
        // throw new Error('Invalid Token')
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      }

      const [isValid, incorrects, params] = ValidateData(req.params, getRules)
      if (!isValid) {
        throw new Error(`Incorrect Parameters - ${incorrects.join(',')}`)
      }

      ret.id = req.params.id

      let user = await fastify.mongo.db
        .collection('Users')
        .findOne({
          id: req.params.id
          // deleted: { $ne: true }
        })
      if (!user) {
        throw new Error('Not Found User')
      }

      if (user.deleted) {
        ret.deleted = true
      } else {
        ret = FilterData(user, schema)

        if (currentUser) {
          ret.active = user.joined && dayjs().diff(user.latestJoinedAt, 'second') < 300
        }
      }

      if (currentUser) {
        const isBlocking = await fastify.mongo.db
          .collection('Blocks')
          .findOne({
            otherUserId: user._id,
            userId: currentUser._id
          })
        if (isBlocking) {
          ret.isBlocking = true
        }
      }

      if (currentUser) {
        const isBlocked = await fastify.mongo.db
          .collection('Blocks')
          .findOne({
            otherUserId: currentUser._id,
            userId: user._id
          })
        if (isBlocked) {
          ret.isBlocked = true
        }
      }

      if (currentUser) {
        const isFollowing = await fastify.mongo.db
          .collection('Follows')
          .findOne({
            otherUserId: user._id,
            userId: currentUser._id
          })
        if (isFollowing) {
          ret.isFollowing = true
        }
      }

      /*
      ret.followingsCount = await fastify.mongo.db
        .collection('Follows')
        .find({
          otherUserId: user._id,
        })
        .count()
      */

      if (currentUser) {
        const isFollowed = await fastify.mongo.db
          .collection('Follows')
          .findOne({
            otherUserId: currentUser._id,
            userId: user._id
          })
        if (isFollowed) {
          ret.isFollowed = true
        }
      }

      /*
      ret.followersCount = await fastify.mongo.db
        .collection('Follows')
        .find({
          userId: user._id,
        })
        .count()
      */

      if (currentUser && (ret.isFollowing || ret.isFollowed)) {
        ret.active = user.joined && dayjs().diff(user.latestJoinedAt, 'second') < 300
      }

      /*
      if (currentUser && (ret.isFollowing || ret.isFollowed) && req.query.count) {
        let unsawPostsAggregate = [
          {
            $match: {
              $and: [
                { postedBy: user._id },
                { deleted: { $ne: true } }
              ]
            }
          }, {
            $lookup: {
              from: "Saws",
              let: { postId: "$_id", userId: currentUser._id },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: [ "$postId", "$$postId" ] },
                        { $eq: [ "$userId", "$$userId" ] }
                      ]
                    }
                  }
                }, {
                  $project: {
                    postId: 0, userId: 0
                  }
                }
              ],
              as: "Saw"
            }
          }, {
            $unwind: {
              path: '$Saw',
              preserveNullAndEmptyArrays: true
            }
          }, {
            $match: {
              Saw: { $exists: false }
            }
          }, {
            $count: 'count'
          }
        ]

        const unsawPostsCount = await fastify.mongo.db
          .collection('Posts')
          .aggregate(unsawPostsAggregate)
          .toArray()
        if (unsawPostsCount.length > 0 && unsawPostsCount[0] && unsawPostsCount[0].count) {
          ret.unsawPostsCount = unsawPostsCount[0].count
        }
      }
      */
    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.get('/bg', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      }

      let user = await fastify.mongo.db
        .collection('Users')
        .findOne({
          id: req.params.id,
          deleted: { $ne: true }
        })
      if (!user) {
        throw new Error('Not Found User')
      } else if (!user.bgId) {
        throw new Error('Bg Not Registered')
      }

      const file = await fastify.mongo.db
        .collection('Files')
        .findOne({
          userId: user._id,
          _id: new fastify.mongo.ObjectId(user.bgId),
          // extension: fileExt,
          deleted: { $ne: true }
        })

      if (!file) {
        throw new Error('Not Found File')
      }

      let mimetype = file.mimetype
      let filename = file.filename

      let bgId
      if (file.mimetype === 'image/heic') {
        mimetype = 'image/jpeg'
        if (file.filename.match(/\.heic/)) {
          filename = file.filename.replace(/.heic/, '.jpg')
        } else {
          filename = file.filename + '.jpg'
        }

        if (file.alternateId) {
          bgId = file.alternateId
        } else {
          bgId = await ConvertImage(fastify, file, 'alternate')
        }
      } else {
        bgId = file._id
      }

      const buf = await LoadFile(String(bgId))

      reply
        .header('Content-Type', mimetype)
        .header('Content-Disposition', `attachment;filename="${encodeURI(filename)}"`)
        .send(buf)

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    // return ret
  }),
  fastify.get('/avatar', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      }

      let user = await fastify.mongo.db
        .collection('Users')
        .findOne({
          id: req.params.id,
          deleted: { $ne: true }
        })
      if (!user) {
        throw new Error('Not Found User')
      } else if (!user.avatarId) {
        throw new Error('Avatar Not Registered')
      }

      const file = await fastify.mongo.db
        .collection('Files')
        .findOne({
          userId: user._id,
          _id: new fastify.mongo.ObjectId(user.avatarId),
          // extension: fileExt,
          deleted: { $ne: true }
        })

      if (!file) {
        throw new Error('Not Found File')
      }

      let mimetype = file.mimetype
      let filename = file.filename

      let avatarId
      if (file.mimetype === 'image/heic') {
        mimetype = 'image/jpeg'
        if (file.filename.match(/\.heic/)) {
          filename = file.filename.replace(/.heic/, '.jpg')
        } else {
          filename = file.filename + '.jpg'
        }

        if (file.alternateId) {
          avatarId = file.alternateId
        } else {
          avatarId = await ConvertImage(fastify, file, 'alternate')
        }
      } else {
        avatarId = file._id
      }

      const buf = await LoadFile(String(avatarId))

      reply
        .header('Content-Type', mimetype)
        .header('Content-Disposition', `attachment;filename="${encodeURI(filename)}"`)
        .send(buf)

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    // return ret
  }),
  /*
  fastify.get('/avatar/thumbnail', async (req, reply) => {
    let ret = {}

    try {
      const email = await fastify.cognito.checkSignIn(fastify, req.headers)
      if (!email) {
        // throw new Error('Invalid Token')
      }

      let currentUser
      if (email) {
        currentUser = await CurrentUser(fastify, email)
      }

      let user = await fastify.mongo.db
        .collection('Users')
        .findOne({
          id: req.params.id,
          deleted: { $ne: true }
        })
      if (!user) {
        throw new Error('Not Found User')
      } else if (!user.avatarId) {
        throw new Error('Avatar Not Registered')
      }

      const file = await fastify.mongo.db
        .collection('Files')
        .findOne({
          userId: user._id,
          _id: new fastify.mongo.ObjectId(user.avatarId),
          // extension: fileExt,
          deleted: { $ne: true }
        })

      if (!file) {
        throw new Error('Not Found File')
      }

      let mimetype = file.mimetype
      let filename = file.filename

      let avatarId
      if (file.thumnbailId) {
        avatarId = file.thumnbailId
      } else {
        avatarId = await ConvertImage(fastify, file, 'thumbnail')
      }

      const buf = await LoadFile(String(avatarId))

      reply
        .header('Content-Type', 'image/jpeg')
        .header('Content-Disposition', 'attachment;filename="thumbnail.jpg"')
        .send(buf)

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    // return ret
  }),
  */
  fastify.post('/follow', async (req, reply) => {
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

      const data = await fastify.mongo.db
        .collection('Users')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          deleted: { $ne: true }
        })

      if (!data) {
        throw new Error('Not Found Data')
      }

      const blocked = await fastify.mongo.db
        .collection('Blocks')
        .find({
          $or: [{
            otherUserId: new fastify.mongo.ObjectId(req.params.id),
            userId: currentUser._id
          }, {
            otherUserId: currentUser._id,
            userId: new fastify.mongo.ObjectId(req.params.id)
          }]
        })
        .toArray()
      if (blocked.length > 0) {
        throw new Error('Can\'t Follow')
      }

      const upserted = await fastify.mongo.db
        .collection('Follows')
        .updateOne({
          otherUserId: new fastify.mongo.ObjectId(req.params.id),
          userId: currentUser._id,
        }, {
          $setOnInsert: {
            followedAt: new Date()
          }
        }, {
          upsert: true
        })

      if (upserted && upserted.upsertedId) {
        ret._id = upserted.upsertedId
      }

      const toUserIds = [new fastify.mongo.ObjectId(req.params.id)]
      await GenerateNotice(fastify, req, 'follow', currentUser._id, toUserIds)

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.delete('/follow', async (req, reply) => {
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

      const data = await fastify.mongo.db
        .collection('Users')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          deleted: { $ne: true }
        })

      if (!data) {
        throw new Error('Not Found Data')
      }

      const deleted = await fastify.mongo.db
        .collection('Follows')
        .deleteOne({
          otherUserId: new fastify.mongo.ObjectId(req.params.id),
          userId: currentUser._id
        })

      // ret._id = deleted.deletedId

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.post('/block', async (req, reply) => {
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

      const data = await fastify.mongo.db
        .collection('Users')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          deleted: { $ne: true }
        })

      if (!data) {
        throw new Error('Not Found Data')
      }

      const upserted = await fastify.mongo.db
        .collection('Blocks')
        .updateOne({
          otherUserId: new fastify.mongo.ObjectId(req.params.id),
          userId: currentUser._id,
        }, {
          $setOnInsert: {
            followedAt: new Date()
          }
        }, {
          upsert: true
        })

      if (upserted && upserted.upsertedId) {
        ret._id = upserted.upsertedId
      }

      await fastify.mongo.db
        .collection('Follows')
        .deleteMany({
          $or: [{
            otherUserId: new fastify.mongo.ObjectId(req.params.id),
            userId: currentUser._id
          }, {
            otherUserId: currentUser._id,
            userId: new fastify.mongo.ObjectId(req.params.id)
          }]
        })

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  }),
  fastify.delete('/block', async (req, reply) => {
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

      const data = await fastify.mongo.db
        .collection('Users')
        .findOne({
          _id: new fastify.mongo.ObjectId(req.params.id),
          deleted: { $ne: true }
        })

      if (!data) {
        throw new Error('Not Found Data')
      }

      const deleted = await fastify.mongo.db
        .collection('Blocks')
        .deleteOne({
          otherUserId: new fastify.mongo.ObjectId(req.params.id),
          userId: currentUser._id
        })

      // ret._id = deleted.deletedId

    } catch (err) {
      console.error(err)
      reply.code(400).send(err)
      return
    }

    return ret
  })
}
