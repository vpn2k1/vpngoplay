import { createFileRoute } from '@tanstack/react-router'
import { Replayable } from '../../../components/ui'
import { Match } from '../../../games/Match'
import { useDeck } from '../../../lib/useDeck'

export const Route = createFileRoute('/decks/$deckId/match')({
  component: function MatchPage() {
    const deck = useDeck()
    return <Replayable>{(restart) => <Match deck={deck} onRestart={restart} />}</Replayable>
  },
})
