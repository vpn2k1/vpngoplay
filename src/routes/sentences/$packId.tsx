import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ThinkingFace } from '../../components/icons'
import { Replayable } from '../../components/ui'
import { SentencePackPlayer } from '../../games/SentencePack'
import { sentencePackQuery } from '../../lib/api'
import { useFollowLang } from '../../lib/lang'

export const Route = createFileRoute('/sentences/$packId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(sentencePackQuery(params.packId)),
  component: SentencePackPage,
  errorComponent: () => (
    <div className="py-20 text-center">
      <ThinkingFace className="mx-auto size-20" />
      <p className="mt-3 text-lg">Không tải được gói câu này.</p>
      <Link to="/sentences" className="mt-4 inline-block text-indigo-600 hover:underline">
        Về Học theo câu
      </Link>
    </div>
  ),
})

function SentencePackPage() {
  const { packId } = Route.useParams()
  const { data: pack } = useSuspenseQuery(sentencePackQuery(packId))
  useFollowLang(pack.lang)
  return <Replayable>{(restart) => <SentencePackPlayer key={pack.id} pack={pack} onRestart={restart} />}</Replayable>
}
