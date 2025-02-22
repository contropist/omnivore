import axios from 'axios'
import { Action, createAction, useKBar, useRegisterActions } from 'kbar'
import debounce from 'lodash/debounce'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import TopBarProgress from 'react-topbar-progress-indicator'
import { useFetchMore } from '../../../lib/hooks/useFetchMoreScroll'
import { usePersistedState } from '../../../lib/hooks/usePersistedState'
import { libraryListCommands } from '../../../lib/keyboardShortcuts/navigationShortcuts'
import { useKeyboardShortcuts } from '../../../lib/keyboardShortcuts/useKeyboardShortcuts'
import {
  PageType,
  State,
} from '../../../lib/networking/fragments/articleFragment'
import { Label } from '../../../lib/networking/fragments/labelFragment'
import { setLabelsMutation } from '../../../lib/networking/mutations/setLabelsMutation'
import {
  SearchItem,
  TypeaheadSearchItemsData,
  typeaheadSearchQuery,
} from '../../../lib/networking/queries/typeaheadSearch'
import type {
  LibraryItem,
  LibraryItemsQueryInput,
} from '../../../lib/networking/queries/useGetLibraryItemsQuery'
import { useGetLibraryItemsQuery } from '../../../lib/networking/queries/useGetLibraryItemsQuery'
import {
  useGetViewerQuery,
  UserBasicData,
} from '../../../lib/networking/queries/useGetViewerQuery'
import { Button } from '../../elements/Button'
import { StyledText } from '../../elements/StyledText'
import { ConfirmationModal } from '../../patterns/ConfirmationModal'
import { LinkedItemCardAction } from '../../patterns/LibraryCards/CardTypes'
import { LinkedItemCard } from '../../patterns/LibraryCards/LinkedItemCard'
import { SetLabelsModal } from '../article/SetLabelsModal'
import { Box, HStack, VStack } from './../../elements/LayoutPrimitives'
import { AddLinkModal } from './AddLinkModal'
import { EditLibraryItemModal } from './EditItemModals'
import { EmptyLibrary } from './EmptyLibrary'
import { HighlightItemsLayout } from './HighlightsLayout'
import { LibraryFilterMenu } from './LibraryFilterMenu'
import { LibraryHeader } from './LibraryHeader'
import { UploadModal } from '../UploadModal'

export type LayoutType = 'LIST_LAYOUT' | 'GRID_LAYOUT'
export type LibraryMode = 'reads' | 'highlights'

const fetchSearchResults = async (query: string, cb: any) => {
  if (!query.startsWith('#')) return
  const res = await typeaheadSearchQuery({
    limit: 10,
    searchQuery: query.substring(1),
  })
  cb(res)
}

const debouncedFetchSearchResults = debounce((query, cb) => {
  fetchSearchResults(query, cb)
}, 300)

export function HomeFeedContainer(): JSX.Element {
  const { viewerData } = useGetViewerQuery()
  const router = useRouter()
  const { queryValue } = useKBar((state) => ({ queryValue: state.searchQuery }))
  const [searchResults, setSearchResults] = useState<SearchItem[]>([])
  const [mode, setMode] = useState<LibraryMode>('reads')

  const defaultQuery = {
    limit: 10,
    sortDescending: true,
    searchQuery: undefined,
  }

  const gridContainerRef = useRef<HTMLDivElement>(null)

  const [labelsTarget, setLabelsTarget] = useState<LibraryItem | undefined>(
    undefined
  )

  const [showAddLinkModal, setShowAddLinkModal] = useState(false)
  const [showEditTitleModal, setShowEditTitleModal] = useState(false)
  const [linkToRemove, setLinkToRemove] = useState<LibraryItem>()
  const [linkToEdit, setLinkToEdit] = useState<LibraryItem>()
  const [linkToUnsubscribe, setLinkToUnsubscribe] = useState<LibraryItem>()

  const [queryInputs, setQueryInputs] =
    useState<LibraryItemsQueryInput>(defaultQuery)

  const {
    itemsPages,
    size,
    setSize,
    isValidating,
    performActionOnItem,
    mutate,
  } = useGetLibraryItemsQuery(queryInputs)

  useEffect(() => {
    if (queryValue.startsWith('#')) {
      debouncedFetchSearchResults(
        queryValue,
        (data: TypeaheadSearchItemsData) => {
          setSearchResults(data?.typeaheadSearch.items || [])
        }
      )
    } else setSearchResults([])
  }, [queryValue])

  useEffect(() => {
    if (
      queryInputs.searchQuery &&
      queryInputs.searchQuery?.indexOf('mode:highlights') > -1
    ) {
      setMode('highlights')
    } else {
      setMode('reads')
    }
  }, [queryInputs])

  useEffect(() => {
    if (!router.isReady) return
    const q = router.query['q']
    let qs = ''
    if (q && typeof q === 'string') {
      qs = q
    }
    if (qs !== (queryInputs.searchQuery || '')) {
      setQueryInputs({ ...queryInputs, searchQuery: qs })
      performActionOnItem('refresh', undefined as unknown as any)
    }
    const mode = router.query['mode']

    // intentionally not watching queryInputs here to prevent infinite looping
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setMode,
    setQueryInputs,
    router.isReady,
    router.query,
    performActionOnItem,
  ])

  const hasMore = useMemo(() => {
    if (!itemsPages) {
      return false
    }
    return itemsPages[itemsPages.length - 1].search.pageInfo.hasNextPage
  }, [itemsPages])

  const libraryItems = useMemo(() => {
    const items =
      itemsPages?.flatMap((ad) => {
        return ad.search.edges
      }) || []
    return items
  }, [itemsPages, performActionOnItem])

  const handleFetchMore = useCallback(() => {
    if (isValidating || !hasMore) {
      return
    }
    setSize(size + 1)
  }, [size, isValidating])

  useEffect(() => {
    if (isValidating || !hasMore || size !== 1) {
      return
    }
    setSize(size + 1)
  }, [size, isValidating])

  const focusFirstItem = useCallback(() => {
    if (libraryItems.length < 1) {
      return
    }
    const firstItem = libraryItems[0]
    if (!firstItem) {
      return
    }
    const firstItemElement = document.getElementById(firstItem.node.id)
    if (!firstItemElement) {
      return
    }
    activateCard(firstItem.node.id)
  }, [libraryItems])

  const activateCard = useCallback(
    (id: string) => {
      if (!document.getElementById(id)) {
        return
      }
      setActiveCardId(id)
      scrollToActiveCard(id, true)
    },
    [libraryItems]
  )

  const isVisible = function (ele: HTMLElement) {
    const container = window.document.documentElement
    const eleTop = ele.offsetTop
    const eleBottom = eleTop + ele.clientHeight

    const containerTop = container.scrollTop + 200
    const containerBottom = containerTop + container.clientHeight

    return eleTop >= containerTop && eleBottom <= containerBottom
  }

  const scrollToActiveCard = useCallback(
    (id: string | null, isSmouth?: boolean): void => {
      if (id) {
        const target = document.getElementById(id)
        if (target) {
          try {
            if (!isVisible(target)) {
              target.scrollIntoView({
                block: 'center',
                behavior: isSmouth ? 'smooth' : 'auto',
              })
            }
            target.focus({
              preventScroll: true,
            })
          } catch (error) {
            console.log('Cannot Scroll', error)
          }
        }
      }
    },
    []
  )

  const alreadyScrolled = useRef<boolean>(false)
  const [activeCardId, setActiveCardId] = usePersistedState<string | null>({
    key: `--library-active-card-id`,
    initialValue: null,
    isSessionStorage: true,
  })

  const activeItem = useMemo(() => {
    if (!activeCardId) {
      return undefined
    }

    return libraryItems.find((item) => item.node.id === activeCardId)
  }, [libraryItems, activeCardId])

  const activeItemIndex = useMemo(() => {
    if (!activeCardId) {
      return undefined
    }

    const result = libraryItems.findIndex(
      (item) => item.node.id === activeCardId
    )
    return result >= 0 ? result : undefined
  }, [libraryItems, activeCardId])

  useEffect(() => {
    if (activeCardId && !alreadyScrolled.current) {
      scrollToActiveCard(activeCardId)
      alreadyScrolled.current = true

      if (activeItem) {
        console.log('refreshing')
        // refresh items on home feed
        performActionOnItem('refresh', activeItem)
      }
    }
  }, [activeCardId, scrollToActiveCard])

  const handleCardAction = async (
    action: LinkedItemCardAction,
    item: LibraryItem | undefined
  ): Promise<void> => {
    if (!item) {
      return
    }

    switch (action) {
      case 'showDetail':
        const username = viewerData?.me?.profile.username
        if (username) {
          setActiveCardId(item.node.id)
          if (item.node.state === State.PROCESSING) {
            router.push(`/article?url=${encodeURIComponent(item.node.url)}`)
          } else {
            const dl =
              item.node.pageType === PageType.HIGHLIGHTS
                ? `#${item.node.id}`
                : ''
            router.push(`/${username}/${item.node.slug}` + dl)
          }
        }
        break
      case 'showOriginal':
        const url = item.node.originalArticleUrl
        if (url) {
          window.open(url, '_blank')
        }
        break
      case 'archive':
        performActionOnItem('archive', item)
        break
      case 'unarchive':
        performActionOnItem('unarchive', item)
        break
      case 'delete':
        performActionOnItem('delete', item)
        break
      case 'mark-read':
        performActionOnItem('mark-read', item)
        break
      case 'mark-unread':
        performActionOnItem('mark-unread', item)
        break
      case 'set-labels':
        setLabelsTarget(item)
        break
      case 'unsubscribe':
        performActionOnItem('unsubscribe', item)
      case 'update-item':
        performActionOnItem('update-item', item)
        break
    }
  }

  const modalTargetItem = useMemo(() => {
    return labelsTarget || linkToEdit || linkToRemove || linkToUnsubscribe
  }, [labelsTarget, linkToEdit, linkToRemove, linkToUnsubscribe])

  useKeyboardShortcuts(
    libraryListCommands((action) => {
      const columnCount = (container: HTMLDivElement) => {
        const gridComputedStyle = window.getComputedStyle(container)
        const gridColumnCount = gridComputedStyle
          .getPropertyValue('grid-template-columns')
          .split(' ').length
        return gridColumnCount
      }

      // If any of the modals are open we disable handling keyboard shortcuts
      if (modalTargetItem) {
        return
      }

      switch (action) {
        case 'openArticle':
          handleCardAction('showDetail', activeItem)
          break
        case 'openOriginalArticle':
          handleCardAction('showOriginal', activeItem)
          break
        case 'showAddLinkModal':
          setTimeout(() => setShowAddLinkModal(true), 0)
          break
        case 'moveFocusToNextListItem': {
          const currentItemIndex = activeItemIndex
          const nextItemIndex =
            currentItemIndex == undefined ? 0 : currentItemIndex + 1
          const nextItem = libraryItems[nextItemIndex]
          if (nextItem) {
            activateCard(nextItem.node.id)
          }
          break
        }
        case 'moveFocusToPreviousListItem': {
          const currentItemIndex = activeItemIndex
          const previousItemIndex =
            currentItemIndex == undefined ? 0 : currentItemIndex - 1
          const previousItem = libraryItems[previousItemIndex]
          if (previousItem) {
            activateCard(previousItem.node.id)
          }
          break
        }
        case 'moveFocusToNextRowItem': {
          const selectedItemIndex = activeItemIndex
          if (selectedItemIndex !== undefined && gridContainerRef?.current) {
            const nextItemIndex = Math.min(
              selectedItemIndex + columnCount(gridContainerRef.current),
              libraryItems.length - 1
            )
            const nextItem = libraryItems[nextItemIndex]
            if (nextItem) {
              const nextItemElement = document.getElementById(nextItem.node.id)
              if (nextItemElement) {
                activateCard(nextItem.node.id)
              }
            }
          } else {
            focusFirstItem()
          }
          break
        }
        case 'moveFocusToPreviousRowItem': {
          const selectedItemIndex = activeItemIndex
          if (selectedItemIndex !== undefined && gridContainerRef?.current) {
            const nextItemIndex = Math.max(
              0,
              selectedItemIndex - columnCount(gridContainerRef.current)
            )
            const nextItem = libraryItems[nextItemIndex]
            if (nextItem) {
              const nextItemElement = document.getElementById(nextItem.node.id)
              if (nextItemElement) {
                activateCard(nextItem.node.id)
              }
            }
          } else {
            focusFirstItem()
          }
          break
        }
        case 'archiveItem':
          handleCardAction('archive', activeItem)
          break
        case 'removeItem':
          handleCardAction('delete', activeItem)
          break
        case 'markItemAsRead':
          handleCardAction('mark-read', activeItem)
          break
        case 'markItemAsUnread':
          handleCardAction('mark-unread', activeItem)
          break
        case 'showEditLabelsModal':
          handleCardAction('set-labels', activeItem)
          break
        case 'sortDescending':
          setQueryInputs({ ...queryInputs, sortDescending: true })
          break
        case 'sortAscending':
          setQueryInputs({ ...queryInputs, sortDescending: false })
          break
      }
    })
  )

  const ARCHIVE_ACTION = !activeItem?.node.isArchived
    ? createAction({
        section: 'Library',
        name: 'Archive selected item',
        shortcut: ['e'],
        perform: () => handleCardAction('archive', activeItem),
      })
    : createAction({
        section: 'Library',
        name: 'UnArchive selected item',
        shortcut: ['e'],
        perform: () => handleCardAction('unarchive', activeItem),
      })

  const ACTIVE_ACTIONS = [
    ARCHIVE_ACTION,
    createAction({
      section: 'Library',
      name: 'Remove item',
      shortcut: ['#'],
      perform: () => handleCardAction('delete', activeItem),
    }),
    createAction({
      section: 'Library',
      name: 'Edit item labels',
      shortcut: ['l'],
      perform: () => handleCardAction('set-labels', activeItem),
    }),
    createAction({
      section: 'Library',
      name: 'Mark item as read',
      shortcut: ['m', 'r'],
      perform: () => {
        console.log('mark read action')
        handleCardAction('mark-read', activeItem)
      },
    }),
    createAction({
      section: 'Library',
      name: 'Mark item as unread',
      shortcut: ['m', 'u'],
      perform: () => handleCardAction('mark-unread', activeItem),
    }),
  ]

  const UNACTIVE_ACTIONS: Action[] = [
    // createAction({
    //   section: 'Library',
    //   name: 'Sort in ascending order',
    //   shortcut: ['s', 'o'],
    //   perform: () => setQueryInputs({ ...queryInputs, sortDescending: false }),
    // }),
    // createAction({
    //   section: 'Library',
    //   name: 'Sort in descending order',
    //   shortcut: ['s', 'n'],
    //   perform: () => setQueryInputs({ ...queryInputs, sortDescending: true }),
    // }),
  ]

  useRegisterActions(
    searchResults.map((link) => ({
      id: link.id,
      section: 'Search Results',
      name: link.title,
      keywords: '#' + link.title + ' #' + link.siteName,
      perform: () => {
        const username = viewerData?.me?.profile.username
        if (username) {
          setActiveCardId(link.id)
          router.push(`/${username}/${link.slug}`)
        }
      },
    })),
    [searchResults]
  )

  useRegisterActions(
    activeCardId ? [...ACTIVE_ACTIONS, ...UNACTIVE_ACTIONS] : UNACTIVE_ACTIONS,
    [activeCardId, activeItem]
  )
  useFetchMore(handleFetchMore)

  return (
    <HomeFeedGrid
      items={libraryItems}
      actionHandler={handleCardAction}
      reloadItems={mutate}
      searchTerm={queryInputs.searchQuery}
      gridContainerRef={gridContainerRef}
      mode={mode}
      setMode={setMode}
      applySearchQuery={(searchQuery: string) => {
        setQueryInputs({
          ...queryInputs,
          searchQuery,
        })
        const qp = new URLSearchParams(window.location.search)
        if (searchQuery) {
          qp.set('q', searchQuery)
        } else {
          qp.delete('q')
        }

        const href = `${window.location.pathname}?${qp.toString()}`
        router.push(href, href, { shallow: true })
        window.sessionStorage.setItem('q', qp.toString())
        performActionOnItem('refresh', undefined as unknown as any)
      }}
      loadMore={() => {
        if (isValidating) {
          return
        }
        setSize(size + 1)
      }}
      hasMore={hasMore}
      hasData={!!itemsPages}
      totalItems={itemsPages?.[0].search.pageInfo.totalCount || 0}
      isValidating={isValidating}
      labelsTarget={labelsTarget}
      setLabelsTarget={setLabelsTarget}
      showAddLinkModal={showAddLinkModal}
      setShowAddLinkModal={setShowAddLinkModal}
      showEditTitleModal={showEditTitleModal}
      setShowEditTitleModal={setShowEditTitleModal}
      setActiveItem={(item: LibraryItem) => {
        activateCard(item.node.id)
      }}
      linkToRemove={linkToRemove}
      setLinkToRemove={setLinkToRemove}
      linkToEdit={linkToEdit}
      setLinkToEdit={setLinkToEdit}
      linkToUnsubscribe={linkToUnsubscribe}
      setLinkToUnsubscribe={setLinkToUnsubscribe}
    />
  )
}

type HomeFeedContentProps = {
  items: LibraryItem[]
  searchTerm?: string
  reloadItems: () => void
  gridContainerRef: React.RefObject<HTMLDivElement>
  applySearchQuery: (searchQuery: string) => void
  hasMore: boolean
  hasData: boolean
  totalItems: number
  isValidating: boolean
  loadMore: () => void
  labelsTarget: LibraryItem | undefined
  setLabelsTarget: (target: LibraryItem | undefined) => void
  showAddLinkModal: boolean
  setShowAddLinkModal: (show: boolean) => void
  showEditTitleModal: boolean
  setShowEditTitleModal: (show: boolean) => void
  setActiveItem: (item: LibraryItem) => void

  linkToRemove: LibraryItem | undefined
  setLinkToRemove: (set: LibraryItem | undefined) => void
  linkToEdit: LibraryItem | undefined
  setLinkToEdit: (set: LibraryItem | undefined) => void
  linkToUnsubscribe: LibraryItem | undefined
  setLinkToUnsubscribe: (set: LibraryItem | undefined) => void

  mode: LibraryMode
  setMode: (set: LibraryMode) => void

  actionHandler: (
    action: LinkedItemCardAction,
    item: LibraryItem | undefined
  ) => Promise<void>
}

function HomeFeedGrid(props: HomeFeedContentProps): JSX.Element {
  const { viewerData } = useGetViewerQuery()
  const [layout, setLayout] = usePersistedState<LayoutType>({
    key: 'libraryLayout',
    initialValue: 'GRID_LAYOUT',
  })

  const updateLayout = useCallback(
    async (newLayout: LayoutType) => {
      if (layout === newLayout) return
      setLayout(newLayout)
    },
    [layout, setLayout]
  )

  const [showFilterMenu, setShowFilterMenu] = useState(false)

  return (
    <VStack
      css={{
        height: '100%',
        width: props.mode == 'highlights' ? '100%' : 'unset',
      }}
    >
      <LibraryHeader
        layout={layout}
        updateLayout={updateLayout}
        searchTerm={props.searchTerm}
        applySearchQuery={(searchQuery: string) => {
          console.log('searching with searchQuery: ', searchQuery)
          props.applySearchQuery(searchQuery)
        }}
        showFilterMenu={showFilterMenu}
        setShowFilterMenu={setShowFilterMenu}
      />
      <HStack css={{ width: '100%', height: '100%' }}>
        <LibraryFilterMenu
          setShowAddLinkModal={props.setShowAddLinkModal}
          searchTerm={props.searchTerm}
          applySearchQuery={(searchQuery: string) => {
            console.log('searching with searchQuery: ', searchQuery)
            props.applySearchQuery(searchQuery)
          }}
          showFilterMenu={showFilterMenu}
          setShowFilterMenu={setShowFilterMenu}
        />

        {!props.isValidating && props.mode == 'highlights' && (
          <HighlightItemsLayout
            gridContainerRef={props.gridContainerRef}
            items={props.items}
            viewer={viewerData?.me}
          />
        )}

        {props.mode == 'reads' && (
          <LibraryItemsLayout
            viewer={viewerData?.me}
            layout={layout}
            {...props}
          />
        )}

        {props.showAddLinkModal && (
          <AddLinkModal onOpenChange={() => props.setShowAddLinkModal(false)} />
        )}
      </HStack>
    </VStack>
  )
}

type LibraryItemsLayoutProps = {
  layout: LayoutType
  viewer?: UserBasicData
} & HomeFeedContentProps

function LibraryItemsLayout(props: LibraryItemsLayoutProps): JSX.Element {
  const [showRemoveLinkConfirmation, setShowRemoveLinkConfirmation] =
    useState(false)
  const [showUnsubscribeConfirmation, setShowUnsubscribeConfirmation] =
    useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [, updateState] = useState({})

  const removeItem = () => {
    if (!props.linkToRemove) {
      return
    }

    props.actionHandler('delete', props.linkToRemove)
    props.setLinkToRemove(undefined)
    setShowRemoveLinkConfirmation(false)
  }

  const unsubscribe = () => {
    if (!props.linkToUnsubscribe) {
      return
    }
    props.actionHandler('unsubscribe', props.linkToUnsubscribe)
    props.setLinkToUnsubscribe(undefined)
    setShowUnsubscribeConfirmation(false)
  }

  return (
    <>
      <VStack
        alignment="start"
        distribution="start"
        css={{
          height: '100%',
          minHeight: '100vh',
        }}
      >
        <Toaster />

        {props.isValidating && props.items.length == 0 && <TopBarProgress />}
        <div
          onDragEnter={(event) => {
            setShowUploadModal(true)
          }}
          style={{ height: '100%', width: '100%' }}
        >
          {!props.isValidating && props.items.length == 0 ? (
            <EmptyLibrary
              onAddLinkClicked={() => {
                props.setShowAddLinkModal(true)
              }}
            />
          ) : (
            <LibraryItems
              items={props.items}
              layout={props.layout}
              viewer={props.viewer}
              gridContainerRef={props.gridContainerRef}
              setShowEditTitleModal={props.setShowEditTitleModal}
              setLinkToEdit={props.setLinkToEdit}
              setShowUnsubscribeConfirmation={setShowUnsubscribeConfirmation}
              setLinkToRemove={props.setLinkToRemove}
              setLinkToUnsubscribe={props.setLinkToUnsubscribe}
              setShowRemoveLinkConfirmation={setShowRemoveLinkConfirmation}
              actionHandler={props.actionHandler}
            />
          )}
          <HStack
            distribution="center"
            css={{ width: '100%', mt: '$2', mb: '$4' }}
          >
            {props.hasMore ? (
              <Button
                style="ctaGray"
                css={{
                  cursor: props.isValidating ? 'not-allowed' : 'pointer',
                }}
                onClick={props.loadMore}
                disabled={props.isValidating}
              >
                {props.isValidating ? 'Loading' : 'Load More'}
              </Button>
            ) : (
              <StyledText style="caption"></StyledText>
            )}
          </HStack>
        </div>
      </VStack>
      {props.showEditTitleModal && (
        <EditLibraryItemModal
          updateItem={(item: LibraryItem) =>
            props.actionHandler('update-item', item)
          }
          onOpenChange={() => props.setShowEditTitleModal(false)}
          item={props.linkToEdit as LibraryItem}
        />
      )}
      {showRemoveLinkConfirmation && (
        <ConfirmationModal
          richMessage={
            <VStack alignment="center" distribution="center">
              <StyledText style="modalTitle" css={{ margin: '0px 8px' }}>
                Are you sure you want to delete this item? All associated notes
                and highlights will be deleted.
              </StyledText>
              {props.linkToRemove?.node && props.viewer && (
                <Box
                  css={{
                    transform: 'scale(0.6)',
                    opacity: 0.8,
                    pointerEvents: 'none',
                    filter: 'grayscale(1)',
                  }}
                >
                  <LinkedItemCard
                    item={props.linkToRemove?.node}
                    viewer={props.viewer}
                    layout="GRID_LAYOUT"
                    // eslint-disable-next-line @typescript-eslint/no-empty-function
                    handleAction={() => {}}
                  />
                </Box>
              )}
            </VStack>
          }
          onAccept={removeItem}
          acceptButtonLabel="Delete Item"
          onOpenChange={() => setShowRemoveLinkConfirmation(false)}
        />
      )}
      {showUnsubscribeConfirmation && (
        <ConfirmationModal
          message={'Are you sure you want to unsubscribe?'}
          onAccept={unsubscribe}
          onOpenChange={() => setShowUnsubscribeConfirmation(false)}
        />
      )}
      {props.labelsTarget?.node.id && (
        <SetLabelsModal
          provider={props.labelsTarget.node}
          onLabelsUpdated={(labels: Label[]) => {
            if (props.labelsTarget) {
              props.labelsTarget.node.labels = labels
              updateState({})
            }
          }}
          save={(labels: Label[]) => {
            if (props.labelsTarget?.node.id) {
              return setLabelsMutation(
                props.labelsTarget.node.id,
                labels.map((label) => label.id)
              )
            }
            return Promise.resolve(undefined)
          }}
          onOpenChange={() => {
            if (props.labelsTarget) {
              const activate = props.labelsTarget
              props.setActiveItem(activate)
              props.setLabelsTarget(undefined)
            }
          }}
        />
      )}
      {showUploadModal && (
        <UploadModal onOpenChange={() => setShowUploadModal(false)} />
      )}
    </>
  )
}

type LibraryItemsProps = {
  items: LibraryItem[]
  layout: LayoutType
  viewer: UserBasicData | undefined

  gridContainerRef: React.RefObject<HTMLDivElement>

  setShowEditTitleModal: (show: boolean) => void
  setLinkToEdit: (set: LibraryItem | undefined) => void
  setShowUnsubscribeConfirmation: (show: true) => void
  setLinkToRemove: (set: LibraryItem | undefined) => void
  setLinkToUnsubscribe: (set: LibraryItem | undefined) => void
  setShowRemoveLinkConfirmation: (show: true) => void

  actionHandler: (
    action: LinkedItemCardAction,
    item: LibraryItem | undefined
  ) => Promise<void>
}

function LibraryItems(props: LibraryItemsProps): JSX.Element {
  return (
    <Box
      ref={props.gridContainerRef}
      css={{
        py: '$3',
        display: 'grid',
        width: '100%',
        gridAutoRows: 'auto',
        borderRadius: '8px',
        gridGap: props.layout == 'LIST_LAYOUT' ? '0' : '20px',
        marginTop: props.layout == 'LIST_LAYOUT' ? '21px' : '0',
        marginBottom: '0px',
        paddingTop: props.layout == 'LIST_LAYOUT' ? '0' : '21px',
        paddingBottom: props.layout == 'LIST_LAYOUT' ? '0px' : '21px',
        overflow: 'hidden',
        '@xlgDown': {
          border: 'unset',
          borderRadius: props.layout == 'LIST_LAYOUT' ? 0 : undefined,
        },
        '@smDown': {
          border: 'unset',
          width: props.layout == 'LIST_LAYOUT' ? '100vw' : undefined,
          margin: props.layout == 'LIST_LAYOUT' ? '16px -16px' : undefined,
          borderRadius: props.layout == 'LIST_LAYOUT' ? 0 : undefined,
        },
        '@media (min-width: 930px)': {
          gridTemplateColumns:
            props.layout == 'LIST_LAYOUT' ? 'none' : 'repeat(2, 1fr)',
        },
        '@media (min-width: 1280px)': {
          gridTemplateColumns:
            props.layout == 'LIST_LAYOUT' ? 'none' : 'repeat(3, 1fr)',
        },
        '@media (min-width: 1600px)': {
          gridTemplateColumns:
            props.layout == 'LIST_LAYOUT' ? 'none' : 'repeat(4, 1fr)',
        },
      }}
    >
      {props.items.map((linkedItem) => (
        <Box
          className="linkedItemCard"
          data-testid="linkedItemCard"
          id={linkedItem.node.id}
          tabIndex={0}
          key={linkedItem.node.id}
          css={{
            width: '100%',
            '&:focus-visible': {
              outline: 'none',
            },
            '&> div': {
              bg: '$thBackground3',
            },
            '&:focus': {
              outline: 'none',
              '> div': {
                outline: 'none',
                bg: '$thBackgroundActive',
              },
            },
            '&:hover': {
              '> div': {
                bg: '$thBackgroundActive',
              },
              '> a': {
                bg: '$thBackgroundActive',
              },
            },
          }}
        >
          {props.viewer && (
            <LinkedItemCard
              layout={props.layout}
              item={linkedItem.node}
              viewer={props.viewer}
              handleAction={(action: LinkedItemCardAction) => {
                if (action === 'delete') {
                  props.setShowRemoveLinkConfirmation(true)
                  props.setLinkToRemove(linkedItem)
                } else if (action === 'editTitle') {
                  props.setShowEditTitleModal(true)
                  props.setLinkToEdit(linkedItem)
                } else if (action == 'unsubscribe') {
                  props.setShowUnsubscribeConfirmation(true)
                  props.setLinkToUnsubscribe(linkedItem)
                } else {
                  props.actionHandler(action, linkedItem)
                }
              }}
            />
          )}
        </Box>
      ))}
    </Box>
  )
}
