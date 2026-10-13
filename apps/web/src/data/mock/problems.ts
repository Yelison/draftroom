import type { Schema } from '@draftroom/contract'
import { ApiError } from '../errors.ts'

type FieldError = Schema<'FieldError'>

// Each refusal is the problem the contract's own examples show: a `type` of `/problems/<code>`, a short English
// `title` for logs and the stable `code`. The mock never produces text for people.

export const unauthenticated = () =>
  new ApiError({
    type: '/problems/unauthenticated',
    title: 'Authentication is required.',
    status: 401,
    code: 'unauthenticated',
  })

export const forbidden = () =>
  new ApiError({ type: '/problems/forbidden', title: 'This role cannot do that.', status: 403, code: 'forbidden' })

/** The same answer for a resource that does not exist and one the caller may not read, so ids cannot be probed. */
export const notFound = () =>
  new ApiError({ type: '/problems/not-found', title: 'Not found.', status: 404, code: 'not-found' })

export const conflict = () =>
  new ApiError({
    type: '/problems/conflict',
    title: 'The request conflicts with the current state.',
    status: 409,
    code: 'conflict',
  })

export const lastOwner = () =>
  new ApiError({
    type: '/problems/last-owner',
    title: 'The last owner cannot be removed or demoted.',
    status: 409,
    code: 'last-owner',
  })

export const documentChanged = (current: Schema<'Document'>) =>
  new ApiError({
    type: '/problems/revision-conflict',
    title: 'The document changed since it was read.',
    status: 409,
    code: 'revision-conflict',
    current,
  })

export const folderChanged = (current: Schema<'Folder'>) =>
  new ApiError({
    type: '/problems/revision-conflict',
    title: 'The folder changed since it was read.',
    status: 409,
    code: 'revision-conflict',
    current,
  })

export const invalid = (...errors: FieldError[]) =>
  new ApiError({
    type: '/problems/validation-failed',
    title: 'The request is not valid.',
    status: 400,
    code: 'validation-failed',
    errors,
  })

export const tooLarge = (...errors: FieldError[]) =>
  new ApiError({
    type: '/problems/too-large',
    title: 'A value exceeds its limit.',
    status: 413,
    code: 'too-large',
    errors,
  })
