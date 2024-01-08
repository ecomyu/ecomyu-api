import fastifyPlugin from 'fastify-plugin'

import axios from 'axios'

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

dayjs.extend(utc)
dayjs.locale('ja')

import { CognitoIdentityProviderClient, GetUserCommand, ListUsersCommand, AdminCreateUserCommand, AdminDeleteUserCommand, AdminResetUserPasswordCommand } from "@aws-sdk/client-cognito-identity-provider"

import { Wait } from "../lib.mjs"

export default fastifyPlugin(function (fastify, opts, done) {
  let token = null

  const client = new CognitoIdentityProviderClient({
    region: process.env.AWS_COGNITO_REGION,
    credentials: {
      accessKeyId: process.env.AWS_COGNITO_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_COGNITO_SECRET_ACCESS_KEY
    }
  })

  fastify.cognito = {
    client: client,
    addUser: async (fastify, user) => {
      let ret = {}

      try {
        let command = new ListUsersCommand({
          UserPoolId: process.env.AWS_COGNITO_USERPOOL_ID,
          Filter: `email = "${user.email}"`
        })
        let res = await fastify.cognito.client.send(command)

        if (res && res.Users && res.Users.length > 0) {
          return false
        } else {
          if (!user.password) {
            user.password = generator.generate({
            	length: 12,
            	numbers: true,
              symbols: true,
              lowercase: true,
              uppercase: true,
              strict: true
            })
          }

          command = new AdminCreateUserCommand({
            UserPoolId: process.env.AWS_COGNITO_USERPOOL_ID,
            Username: email,
            UserAttributes: [
              {
                Name: 'email', Value: user.email
              }, {
                Name: 'email_verified', Value: 'True'
              }
            ],
            TemporaryPassword: user.password
          })
          await fastify.cognito.client.send(command)
        }

        return ret
      } catch (e) {
        console.error(e)
        return ret
      }
    },
    deleteUser: async (fastify, user) => {
      try {
        let command = new ListUsersCommand({
          UserPoolId: process.env.AWS_COGNITO_USERPOOL_ID,
          Filter: `email = "${user.email}"`
        })
        let res = await fastify.cognito.client.send(command)

        if (!res || !res.Users || res.Users.length === 0) {
          return false
        } else {
          command = new AdminDeleteUserCommand({
            UserPoolId: process.env.AWS_COGNITO_USERPOOL_ID,
            Username: user.email
          })
          await fastify.cognito.client.send(command)

          return true
        }
      } catch (e) {
        console.error(e)
        return false
      }
    },
    checkSignIn: async (fastify, headers) => {
      let email = null

      if (!headers.authorization) {
        return null
      }

      let token = await fastify.mongo.db.collection('Tokens').findOne({
        token: headers.authorization,
        expiresIn: { $gt: dayjs().toDate() },
        deleted: { $ne: true }
      })

      if (token) {
        email = token.email
      } else {
        await Wait(300)

        try {
          let accessToken = null
          if (headers.authorization.startsWith('Bearer ')) {
            accessToken = headers.authorization.substring(7, headers.authorization.length)
            // console.log(jwtDecode(accessToken))
          }

          const command = new GetUserCommand({
            AccessToken: accessToken
          })
          const res = await fastify.cognito.client.send(command)

          if (!res || !res.UserAttributes) {
            throw new Error('Failed Auth')
          } else {
            for (let attribute of res.UserAttributes) {
              if (attribute.Name === 'email') {
                email = attribute.Value
              }
            }

            if (!email) {
              throw new Error('Failed Auth')
            }
            const user = await fastify.mongo.db.collection('Users').findOne({
              email: email,
              // authorized: true,
              // permitted: true,
              deleted: { $ne: true }
            })

            if (!user) {
              throw new Error('Not Found User')
            }

            await fastify.mongo.db.collection('Tokens').updateMany({
              userId: user._id,
              token: {
                $ne: headers.authorization
              },
              email: email,
            }, {
              $set: {
                deleted: true,
                deletedAt: new Date()
              }
            })

            token = {
              userId: user._id,
              email: email,
              token: headers.authorization,
              expiresIn: dayjs().add(process.env.TOKEN_EXPIRATION, 'seconds').toDate()
            }

            const inserted = await fastify.mongo.db.collection('Tokens').insertOne(token)
            token._id = inserted.insertedId
          }
        } catch(e) {
          console.log(e)
          throw e
        }
      }

      if (email) {
        await fastify.mongo.db.collection('Users').updateOne({
          email: email,
          deleted: { $ne: true }
        }, {
          $set: {
            joined: true,
            latestJoinedAt: new Date()
            // loggedin: true,
            // loggedinAt: new Date()
          }
        })
      }

      return email
    }
  }

  done()
})
