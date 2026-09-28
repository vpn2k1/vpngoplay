import { createFileRoute } from '@tanstack/react-router'
import { Replayable } from '../../../components/ui'
import { Quiz } from '../../../games/Quiz'
import { useDeck } from '../../../lib/useDeck'

export const Route = createFileRoute('/decks/$deckId/quiz')({
  component: function QuizPage() {
    const deck = useDeck()
    return <Replayable>{(restart) => <Quiz deck={deck} onRestart={restart} />}</Replayable>
  },
})
