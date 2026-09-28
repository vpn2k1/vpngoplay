import { createFileRoute } from '@tanstack/react-router'
import { Replayable } from '../../../components/ui'
import { SentenceBuilder } from '../../../games/SentenceBuilder'
import { useDeck } from '../../../lib/useDeck'

export const Route = createFileRoute('/decks/$deckId/sentence')({
  component: function SentenceBuilderPage() {
    const deck = useDeck()
    return <Replayable>{(restart) => <SentenceBuilder deck={deck} onRestart={restart} />}</Replayable>
  },
})
