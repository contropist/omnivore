import * as chai from 'chai'
import { expect } from 'chai'
import chaiString from 'chai-string'
import * as fs from 'fs'
import 'mocha'
import { ArticleSavingRequestStatus, ImportContext } from '../../src'
import { importCsv } from '../../src/csv'
import { stubImportCtx } from '../util'

chai.use(chaiString)

describe('Load a simple CSV file', () => {
  it('should call the handler for each URL', async () => {
    const urls: URL[] = []
    const stream = fs.createReadStream('./test/csv/data/simple.csv')
    const stub = stubImportCtx()
    stub.urlHandler = (ctx: ImportContext, url): Promise<void> => {
      urls.push(url)
      return Promise.resolve()
    }

    await importCsv(stub, stream)
    expect(stub.countFailed).to.equal(0)
    expect(stub.countImported).to.equal(2)
    expect(urls).to.eql([
      new URL('https://omnivore.app'),
      new URL('https://google.com'),
    ])
  })

  it('increments the failed count when the URL is invalid', async () => {
    const urls: URL[] = []
    const stream = fs.createReadStream('./test/csv/data/simple.csv')
    const stub = stubImportCtx()
    stub.urlHandler = (ctx: ImportContext, url): Promise<void> => {
      urls.push(url)
      return Promise.reject('Failed to import url')
    }

    await importCsv(stub, stream)
    expect(stub.countFailed).to.equal(2)
    expect(stub.countImported).to.equal(0)
  })
})

describe('Load a complex CSV file', () => {
  it('should call the handler for each URL, state and labels', async () => {
    const results: {
      url: URL
      state?: ArticleSavingRequestStatus
      labels?: string[]
    }[] = []
    const stream = fs.createReadStream('./test/csv/data/complex.csv')
    const stub = stubImportCtx()
    stub.urlHandler = (
      ctx: ImportContext,
      url,
      state,
      labels
    ): Promise<void> => {
      results.push({
        url,
        state,
        labels,
      })
      return Promise.resolve()
    }

    await importCsv(stub, stream)
    expect(stub.countFailed).to.equal(0)
    expect(stub.countImported).to.equal(3)
    expect(results).to.eql([
      {
        url: new URL('https://omnivore.app'),
        state: 'ARCHIVED',
        labels: ['test'],
      },
      {
        url: new URL('https://google.com'),
        state: 'SUCCEEDED',
        labels: ['test', 'development'],
      },
      {
        url: new URL('https://test.com'),
        state: 'SUCCEEDED',
        labels: ['test', 'development'],
      },
    ])
  })
})

describe('A file with no status set', () => {
  it('should not try to set status', async () => {
    const states: (ArticleSavingRequestStatus | undefined)[] = []
    const stream = fs.createReadStream('./test/csv/data/unset-status.csv')
    const stub = stubImportCtx()
    stub.urlHandler = (
      ctx: ImportContext,
      url,
      state?: ArticleSavingRequestStatus
    ): Promise<void> => {
      states.push(state)
      return Promise.resolve()
    }

    await importCsv(stub, stream)
    expect(stub.countFailed).to.equal(0)
    expect(stub.countImported).to.equal(2)
    expect(states).to.eql([undefined, ArticleSavingRequestStatus.Archived])
  })
})

describe('A file with some labels', () => {
  it('gets the labels, handles empty, and trims extra whitespace', async () => {
    const importedLabels: (string[] | undefined)[] = []
    const stream = fs.createReadStream('./test/csv/data/labels.csv')
    const stub = stubImportCtx()
    stub.urlHandler = (
      ctx: ImportContext,
      url,
      state?: ArticleSavingRequestStatus,
      labels?: string[]
    ): Promise<void> => {
      importedLabels.push(labels)
      return Promise.resolve()
    }

    await importCsv(stub, stream)
    expect(stub.countFailed).to.equal(0)
    expect(stub.countImported).to.equal(3)
    expect(importedLabels).to.eql([
      ['Label1', 'Label2', 'Label 3', 'Label 4'],
      [],
      [],
    ])
  })
})
