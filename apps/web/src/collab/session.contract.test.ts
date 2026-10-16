import { describeSessionContract } from './testing/sessionContract.ts'
import { createWorld, reader, editor, stranger, wireName } from './testing/sessionWorld.ts'

const identities = { editor, reader, stranger }

describeSessionContract('the provider over a simulated socket', () => {
  const world = createWorld()
  return {
    server: world.server,
    wireName,
    open: (who) => world.open(identities[who]).session,
    dispose: world.dispose,
  }
})
