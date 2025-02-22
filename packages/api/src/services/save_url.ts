import { PubsubClient } from '../datalayer/pubsub'
import { ArticleSavingRequestStatus } from '../elastic/types'
import { User } from '../entity/user'
import { getRepository } from '../entity/utils'
import { homePageURL } from '../env'
import { SaveErrorCode, SaveResult, SaveUrlInput } from '../generated/graphql'
import { createPageSaveRequest } from './create_page_save_request'
import { createLabels } from './labels'

interface SaveContext {
  pubsub: PubsubClient
  uid: string
}

export const saveUrl = async (
  ctx: SaveContext,
  user: User,
  input: SaveUrlInput
): Promise<SaveResult> => {
  try {
    // save state
    const archivedAt =
      input.state === ArticleSavingRequestStatus.Archived ? new Date() : null
    // add labels to page
    const labels = input.labels
      ? await createLabels({ ...ctx, uid: ctx.uid }, input.labels)
      : undefined

    const pageSaveRequest = await createPageSaveRequest({
      userId: ctx.uid,
      url: input.url,
      pubsub: ctx.pubsub,
      articleSavingRequestId: input.clientRequestId,
      archivedAt,
      labels,
      user,
    })

    return {
      clientRequestId: pageSaveRequest.id,
      url: `${homePageURL()}/${user.profile.username}/links/${
        pageSaveRequest.id
      }`,
    }
  } catch (error) {
    console.log('error enqueuing request', error)
    return {
      __typename: 'SaveError',
      errorCodes: [SaveErrorCode.Unknown],
    }
  }
}

export const saveUrlFromEmail = async (
  ctx: SaveContext,
  url: string,
  clientRequestId: string
): Promise<boolean> => {
  const user = await getRepository(User).findOneBy({
    id: ctx.uid,
  })
  if (!user) {
    return false
  }

  const result = await saveUrl(ctx, user, {
    url,
    clientRequestId,
    source: 'email',
  })
  if (result.__typename === 'SaveError') {
    return false
  }

  return true
}
