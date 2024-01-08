import fs from 'fs'
import path from 'path'

import axios from 'axios'

import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import 'dayjs/locale/ja.js'

import validator from 'validator'

import sanitizeHtml from 'sanitize-html'

import cloneDeep from 'clone-deep'

import Autolinker from 'autolinker'

let s3Config

if (process.env.AWS_S3_ACCESS_KEY_ID) {
  s3Config = {
    region: process.env.AWS_S3_REGION,
    credentials: {
      accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY
    }
  }
} else {
  s3Config = {
    region: process.env.AWS_S3_REGION
  }
}

const s3client = new S3Client(s3Config)

dayjs.extend(utc)
dayjs.locale('ja')

export const CurrentUser = async (fastify, email) => {
  const user = await fastify.mongo.db.collection('Users').findOne({
    email: email,
    deleted: { $ne: true }
  })

  return user
}

export const AdUsers = async (fastify) => {
  let ret = []
  const adUsers = await fastify.mongo.db
    .collection('Users')
    .find({
      id: '3d10000'
    })
    .toArray()
  if (adUsers.length > 0) {
    for (let user of adUsers) {
      ret.push(user._id)
    }
  }
  return ret
}

export const BlockUsers = async (fastify, currentUser) => {
  let ret = []
  const blockingUsers = await fastify.mongo.db
    .collection('Blocks')
    .find({
      userId: currentUser._id
    })
    .toArray()
  if (blockingUsers.length > 0) {
    for (let user of blockingUsers) {
      ret.push(user.otherUserId)
    }
  }

  const blockedUsers = await fastify.mongo.db
    .collection('Blocks')
    .find({
      otherUserId: currentUser._id
    })
    .toArray()
  if (blockedUsers.length > 0) {
    for (let user of blockedUsers) {
      ret.push(user.userId)
    }
  }

  return ret
}

export const Followers = async (fastify, user) => {
  let ret = []
  const followers = await fastify.mongo.db
    .collection('Follows')
    .find({
      otherUserId: user._id,
    })
    .sort({
      followedAt: -1
    })
    .toArray()

  if (followers.length > 0) {
    for (let follow of followers) {
      ret.push(follow.userId)
    }
  }

  return ret
}

export const Wait = async (ms) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}

export const IsBoolean = (value) => {
  return (typeof value === 'boolean')
}

export const IsNumber = (value) => {
  return ((typeof value === 'number') && (isFinite(value)))
}

export const ValidateData = (inputs, dataRules) => {
  const incorrects = []
  const data = {}

  for (const [fieldKey, fieldRules] of Object.entries(dataRules)) {
    if (!fieldRules) continue

    if (inputs[fieldKey] === undefined) continue
    let fieldValue = inputs[fieldKey]

    let incorrect = false
    for (let [rule, option] of Object.entries(fieldRules)) {
      rule = rule.toLowerCase()

      if (rule === 'required') {
        if (typeof fieldValue === 'boolean') {
          if (!fieldValue === true && !fieldValue === false) {
            incorrect = true
          }
        } else {
          if (validator.isEmpty(fieldValue)) {
            incorrect = true
          }
        }
      } else if (rule === 'isempty') {
        if (fieldValue && !validator.isEmpty(fieldValue)) {
          incorrect = true
        }
      } else if (rule === 'email') {
        if (fieldValue && !validator.isEmail(fieldValue)) {
          incorrect = true
        }
      } else if (rule === 'regex') {
        if (fieldValue && !String(fieldValue).match(option)) {
          incorrect = true
        }
      } else if (rule === 'isin') {
        if (fieldValue && option.indexOf(fieldValue) < 0) {
          incorrect = true
        }
      } else if (rule === 'minlength') {
        if (fieldValue && String(fieldValue).length < Number(option)) {
          incorrect = true
        }
      } else if (rule === 'maxlength') {
        if (fieldValue && String(fieldValue).length > Number(option)) {
          incorrect = true
        }
      } else if (rule === 'isdate') {
        if (fieldValue === '') {
        } else if (typeof fieldValue === 'date') {
        } else if (typeof fieldValue === 'string') {
          try {
            fieldValue = dayjs(fieldValue + ' 00:00').toDate()
          } catch (e) {
            incorrect = true
          }
        }
      } else if (rule === 'isurl') {
        if (fieldValue && !validator.isURL(fieldValue, { protocols: ['https', 'http'] })) {
          incorrect = true
        }
      } else if (rule === 'ishtml') {
        if (fieldValue) {
          let dirty = String(fieldValue).trim()
          let crean = sanitizeHtml(dirty, {
            allowedTags: [ 'b', 'i', 'strike', 'u', 'a', 'div', 'pre', 'br', 'ul', 'ol', 'li' ],
            allowedAttributes: {
              'a': [ 'href' ],
              'div': [ 'style' ]
            },
            // allowedIframeHostnames: ['www.youtube.com']
          })
          if (dirty !== crean) {
            incorrect = true
          }
        }
      }
    }

    if (incorrect) {
      incorrects.push(`${fieldKey}`)
    } else {
      data[fieldKey] = fieldValue
    }
  }
  return [!(incorrects.length > 0), incorrects, data]
}

const autolinker = new Autolinker({
  hashtag: 'twitter'
})

export const AutoTags = (str) => {
  let obj = {}

  const linkedText = autolinker.link(str)
  const tagTexts = linkedText.match(/<a href="https:\/\/twitter.com\/hashtag\/\S+" target="_blank" rel="noopener noreferrer">\S+<\/a>/g)
  if (tagTexts && tagTexts.length > 0) {
    for (let tagText of tagTexts) {
      if (tagText.match(/<a href="https:\/\/twitter.com\/hashtag\/\S+" target="_blank" rel="noopener noreferrer">(\S+)<\/a>/)) {
        const tag = RegExp.$1
        obj[tag.substr(1)] = true
      }
    }
  }

  let arr = []
  for (const [tag, bool] of Object.entries(obj)) {
    arr.push(tag)
  }

  return arr
}

export const RecursiveEach = (hash, func) => {
  for (let key in hash) {
    if (typeof hash[key] == "object" && hash[key] !== null) {
      RecursiveEach(hash[key], func)
    } else {
      let ret = func(key, hash[key])
      if (ret) {
        hash[key] = ret
      }
    }
  }
}

export const RecursivePosts = async (fastify, _id, arr) => {
  const post = await fastify.mongo.db
    .collection('Posts')
    .findOne({
      _id: _id,
      // deleted: { $ne: true }
    })
  if (post && post.parentId) {
    arr.push(post.parentId)
    RecursivePosts(fastify, post.parentId, arr)
  }
}

export const Clone = (obj) => {
  return cloneDeep(obj)
}

export const Shuffle = (str) => {
  let arr = str.split('')
  let c = 0
  do {
    let r = Math.floor(Math.random() * arr.length)
    let char = arr[c]
    arr[c] = arr[r]
    arr[r] = char
    c++
  } while (c < arr.length)

  return arr.join('')
}

const commonFields = ['postedAt', 'postedBy', 'patchedAt', 'patchedBy', 'deleted', 'deletedAt', 'deletedBy']
export const FilterData = (data, schema) => {
  let ret = {}
  for (let [key, value] of Object.entries(data)) {
    if (key === '_id') {
      ret[key] = value
    } else if (Object.keys(schema).indexOf(key) >= 0) {
      ret[key] = value
    } else if (commonFields.indexOf(key) >= 0) {
      ret[key] = value
    }
  }
  return ret
}

export const ExtractChangedData = (newData, oldData) => {
  let data = {}

  for (let [key, value] of Object.entries(newData)) {
    if (key === '_id') { continue }
    if (!JSON.stringify(oldData[key])) {
      data[key] = value
    } else {
      switch (typeof value) {
        case 'string':
        case 'boolean':
        case 'number':
          if (oldData[key] !== value) {
            data[key] = value
          }
          break
        case 'object':
          if (JSON.stringify(oldData[key]) !== JSON.stringify(value)) {
            data[key] = value
          }
          break
        default:
          data[key] = value
      }
    }
  }

  return data
}

export const StripHtmlTags = (value) => {
  return String(value).replace(/(<([^>]+)>)/gi, "")
}

export const EscapeRegex = (string) => {
  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

export const ReplaceTexts = (str, obj) => {
  let _str = str

  for (let key in obj.texts) {
    let value = obj.texts[key]

    value = StripHtmlTags(value)

    let re = new RegExp(`%%${key}%%`, 'g')
    console.log(key, re, value)
    _str = _str.replace( re, value )
  }

  return _str
}

export const LoadFile = async (fileId) => {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileId
    })

    const res = await s3client.send(command)

    return res.Body ? res.Body.transformToByteArray() : null
  } catch (e) {
    console.log('LoadFile:', e)
  }
}

export const SaveFile = async (fileId, buf, contentType) => {
  try {
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileId,
      Body: buf,
      ContentType: contentType
    })

    await s3client.send(command)
  } catch (e) {
    console.log('SaveFile:', e)
  }
}

export const ExistsFile = async (fileId) => {
  try {
    const command = new HeadObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileId
    })

    const res = await s3client.send(command)

    return res.$metadata ? res.$metadata : null
  } catch (e) {
    console.log('ExistsFile:', e)
  }
  return false
}

export const DeleteFile = async (fileId) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileId
    })

    await s3client.send(command)
  } catch (e) {
    console.log('DeleteFile:', e)
  }
}

export const GenerateNotice = async (fastify, req, action, currentUserId, toUserIds, postId) => {
  let notice = {
    action: action,
    postedBy: currentUserId,
    postedAt: new Date()
  }

  if (postId) {
    notice.postId = postId
  }

  for (const toUserId of toUserIds) {
    notice.to = toUserId

    await fastify.mongo.db
      .collection('Notices')
      .insertOne(Clone(notice))
  }
}

export const EmitBackgroundNotice = async (fastify, action, notice) => {
  try {
    await fastify.io.emit('msg', `data:application/vnd.${action},${encodeURIComponent(JSON.stringify(notice))}`)
  } catch (e) {
    console.log(e)
    return false
  }
  return true
}
