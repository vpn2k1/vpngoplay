import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { ThinkingFace } from '../../../components/icons'
import { deckQuery } from '../../../lib/api'

export const Route = createFileRoute('/decks/$deckId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(deckQuery(params.deckId)),
  component: Outlet,
  errorComponent: () => (
    <div className="py-20 text-center">
      <ThinkingFace className="mx-auto size-20" />
      <p className="mt-3 text-lg">Không tải được bộ từ này.</p>
      <Link to="/" className="mt-4 inline-block text-indigo-600 hover:underline">
        Về trang chủ
      </Link>
    </div>
  ),
})
