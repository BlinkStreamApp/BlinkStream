import { readFileSync } from 'node:fs'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { featureLanguages, recentTranslations } from './recentTranslations'
import { setLanguage } from './i18n'
import ChannelCollections from '../components/ChannelCollections'
import QRCodeSvg from '../components/QRCodeSvg'
import { collectionsKey } from './channelCollections'

afterEach(() => { cleanup(); setLanguage('es') })

describe('recent feature translations', () => {
  it('has complete, nonempty messages in every supported language', () => {
    const keys = Object.keys(recentTranslations.es)
    expect(featureLanguages).toHaveLength(8)
    for (const language of featureLanguages) {
      expect(Object.keys(recentTranslations[language])).toEqual(keys)
      for (const key of keys) {
        expect(recentTranslations[language][key], `${language}: ${key}`).toBeTypeOf('string')
        expect(recentTranslations[language][key].trim()).not.toBe('')
        expect(recentTranslations[language][key]).not.toMatch(/\uFFFD/)
      }
    }
  })

  it('covers keys used by new components and collection validation errors', () => {
    for (const path of ['../components/ChannelCollections.jsx', '../components/CategoryExplorer.jsx', '../components/CompanionModal.jsx', '../components/QRCodeSvg.jsx']) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8')
      for (const [, key] of source.matchAll(/t\('(collections\.[^']+|browse\.[^']+|companion\.[^']+|qr\.[^']+)'/g)) {
        expect(recentTranslations.es[key], key).toBeTruthy()
      }
    }
    for (const path of ['./channelCollections.js', './collectionCover.js']) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8')
      for (const [, message] of source.matchAll(/new Error\('([^']+)'\)/g)) {
        expect(recentTranslations.es[message], message).toBeTruthy()
      }
    }
  })

  it.each(featureLanguages)('renders collections and QR access in %s without changing user content', language => {
    setLanguage(language)
    localStorage.setItem(collectionsKey('alice'), JSON.stringify([{ id: 'a', name: 'Mi Gaming', channels: ['mychannel'] }]))
    render(<ChannelCollections owner="alice" onSelect={() => {}} />)
    render(<QRCodeSvg value="http://192.168.1.2:9876/#pin=test" />)
    expect(screen.getByRole('heading', { name: new RegExp(recentTranslations[language]['collections.title']) })).toBeVisible()
    expect(screen.getByRole('button', { name: recentTranslations[language]['collections.new'] })).toBeVisible()
    expect(screen.getByRole('img', { name: recentTranslations[language]['qr.label'] })).toBeVisible()
    expect(screen.getByText('Mi Gaming', { selector: 'span' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'mychannel' })).toBeVisible()
  })

  it('updates visible labels when changing language without resetting collection selection', () => {
    setLanguage('es')
    localStorage.setItem(collectionsKey('alice'), JSON.stringify([{ id: 'a', name: 'Gaming', channels: ['first'] }]))
    render(<ChannelCollections owner="alice" onSelect={() => {}} />)
    act(() => setLanguage('fr'))
    expect(screen.getByRole('button', { name: 'Nouvelle collection' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'first' })).toBeVisible()
  })
})
