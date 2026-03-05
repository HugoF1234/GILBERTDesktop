import { describe, it, expect } from 'vitest'

describe('Vitest setup', () => {
  it('should run a basic assertion', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle string operations', () => {
    const greeting = 'Hello, Gilbert!'
    expect(greeting).toContain('Gilbert')
    expect(greeting).toHaveLength(15)
  })

  it('should work with objects', () => {
    const meeting = { id: '1', title: 'Standup', status: 'active' }
    expect(meeting).toEqual({ id: '1', title: 'Standup', status: 'active' })
    expect(meeting).toHaveProperty('status', 'active')
  })
})
