import { createFileRoute } from '@tanstack/react-router'
import { Replayable } from '../../../components/ui'
import { Listening } from '../../../games/Listening'
import { useDeck } from '../../../lib/useDeck'

export const Route = createFileRoute('/decks/$deckId/listen')({
  component: function ListeningPage() {
    const deck = useDeck()
    return <Replayable>{(restart) => <Listening deck={deck} onRestart={restart} />}</Replayable>
  },
})
