import { describe, expect, it } from 'vitest'
import {
  hasImages,
  insertImages,
  noteSnippet,
  noteText,
  parseBlocks,
  removeImage,
  serializeBlocks,
} from './noteBlocks'

const shape = (bs: ReturnType<typeof parseBlocks>) => bs.map((b) => (b.t === 'img' ? `img:${b.id}` : b.text))

describe('noteBlocks', () => {
  it('texto sem fotos vira um único bloco e volta igual', () => {
    const bs = parseBlocks('linha 1\nlinha 2')
    expect(shape(bs)).toEqual(['linha 1\nlinha 2'])
    expect(serializeBlocks(bs)).toBe('linha 1\nlinha 2')
  })

  it('separa texto e fotos, sempre com um texto antes, entre e depois', () => {
    expect(shape(parseBlocks('antes\n[[img:a1]]\ndepois'))).toEqual(['antes', 'img:a1', 'depois'])
    expect(shape(parseBlocks('[[img:a1]]\n[[img:b2]]'))).toEqual(['', 'img:a1', '', 'img:b2', ''])
    expect(shape(parseBlocks(''))).toEqual([''])
  })

  it('serializar e ler de novo é estável', () => {
    const once = serializeBlocks(parseBlocks('[[img:a1]]\n[[img:b2]]'))
    expect(serializeBlocks(parseBlocks(once))).toBe(once)
  })

  it('ignora referências que não estão numa linha só delas', () => {
    expect(shape(parseBlocks('veja [[img:a1]] aqui'))).toEqual(['veja [[img:a1]] aqui'])
  })

  it('texto e resumo da nota não mostram as referências', () => {
    expect(noteText('oi\n[[img:a1]]\ntchau')).toBe('oi\ntchau')
    expect(noteSnippet('oi\n[[img:a1]]\ntchau')).toBe('oi tchau')
    expect(noteSnippet('[[img:a1]]')).toBe('📷 Foto')
    expect(noteSnippet('')).toBe('Nota vazia')
    expect(hasImages('[[img:a1]]')).toBe(true)
    expect(hasImages('nada')).toBe(false)
  })

  it('colar foto divide o texto no cursor', () => {
    const bs = parseBlocks('abcdef')
    const r = insertImages(bs, bs[0].k, 3, ['x1', 'x2'])
    expect(shape(r.blocks)).toEqual(['abc', 'img:x1', 'img:x2', 'def'])
    expect(r.blocks.find((b) => b.k === r.focus)).toMatchObject({ t: 'text', text: 'def' })
  })

  it('colar foto num bloco que sumiu põe a foto no fim', () => {
    const bs = parseBlocks('abc')
    expect(shape(insertImages(bs, 'nao-existe', 0, ['x1']).blocks)).toEqual(['abc', 'img:x1', ''])
  })

  it('remover foto junta os textos dos dois lados', () => {
    const bs = parseBlocks('antes\n[[img:a1]]\ndepois')
    const r = removeImage(bs, bs[1].k)
    expect(shape(r.blocks)).toEqual(['antes\ndepois'])
    expect(r.focus).toBe(r.blocks[0].k)
  })
})
