/**
 * config.mjs 启动校验单测（node:test，无外部依赖）。
 * 运行：node --test infra/manage/config.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateManageConfig } from './config.mjs'

const validEnv = {
  NUXT_INTERNAL_API_URL: 'http://anynote-gateway:8080',
  NUXT_PUBLIC_APP_URL: 'https://manage.example.com',
  DEPLOYMENT_ENV: 'production',
}

test('合法配置通过', () => {
  assert.deepEqual(validateManageConfig(validEnv), [])
})

test('缺少必配项报错并带中文指引', () => {
  const errors = validateManageConfig({})
  assert.equal(errors.length, 2)
  assert.match(errors[0], /NUXT_INTERNAL_API_URL/)
  assert.match(errors[1], /NUXT_PUBLIC_APP_URL/)
})

test('非完整 URL 报错', () => {
  const errors = validateManageConfig({ ...validEnv, NUXT_INTERNAL_API_URL: 'anynote-gateway:8080' })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /http\(s\):\/\//)
})

test('生产环境拒绝明文 http 来源', () => {
  const errors = validateManageConfig({ ...validEnv, NUXT_PUBLIC_APP_URL: 'http://manage.example.com' })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /https/)
})

test('开发环境允许 http 来源', () => {
  const errors = validateManageConfig({ ...validEnv, DEPLOYMENT_ENV: 'development', NUXT_PUBLIC_APP_URL: 'http://localhost:3080' })
  assert.deepEqual(errors, [])
})

test('空白字符串视为缺失', () => {
  const errors = validateManageConfig({ ...validEnv, NUXT_INTERNAL_API_URL: '   ' })
  assert.equal(errors.length, 1)
})
