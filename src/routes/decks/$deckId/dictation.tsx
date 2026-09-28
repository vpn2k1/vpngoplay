import { createFileRoute } from '@tanstack/react-router'
import { Replayable } from '../../../components/ui'
import { Dictation } from '../../../games/Dictation'
import { useDeck } from '../../../lib/useDeck'

export const Route = createFileRoute('/decks/$deckId/dictation')({
  component: function DictationPage() {
    const deck = useDeck()
    return <Replayable>{(restart) => <Dictation deck={deck} onRestart={restart} />}</Replayable>
  },
})
