import { describe, expect, it } from 'vitest'
import { vibeAt } from './LocalTimePill'

describe('vibeAt', () => {
  it('says sleeping in the small hours and marks it as night', () => {
    expect(vibeAt(3)).toMatchObject({ text: 'probably sleeping 😴', night: true })
  })
  it('covers every hour of the day', () => {
    for (let h = 0; h < 24; h++) expect(vibeAt(h).text).toBeTruthy()
  })
  it('switches at the boundaries', () => {
    expect(vibeAt(8).text).toBe('waking up ☕')
    expect(vibeAt(9).text).toBe('coding 💻')
    expect(vibeAt(13).text).toBe('lunch break 🍛')
    expect(vibeAt(22).night).toBe(true)
  })
})
