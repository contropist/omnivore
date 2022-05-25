import Models
import Services
import SwiftUI
import Views
import WebKit

#if os(iOS)
  struct WebReaderContainerView: View {
    @Environment(\.scenePhase) var scenePhase

    let item: LinkedItem

    @State private var showFontSizePopover = false
    @State private var showLabelsModal = false
    @State var showHighlightAnnotationModal = false
    @State var safariWebLink: SafariWebLink?
    @State private var navBarVisibilityRatio = 1.0
    @State private var showDeleteConfirmation = false
    @State private var showOverlay = false
    @State private var showLaunchImageOnOverlay = false
    @State private var progressViewOpacity = 0.0
    @State var increaseFontActionID: UUID?
    @State var decreaseFontActionID: UUID?
    @State var annotationSaveTransactionID: UUID?
    @State var showNavBarActionID: UUID?
    @State var shareActionID: UUID?
    @State var annotation = String()

    @EnvironmentObject var dataService: DataService
    @Environment(\.presentationMode) var presentationMode: Binding<PresentationMode>
    @StateObject var viewModel = WebReaderViewModel()

    var fontAdjustmentPopoverView: some View {
      FontSizeAdjustmentPopoverView(
        increaseFontAction: { increaseFontActionID = UUID() },
        decreaseFontAction: { decreaseFontActionID = UUID() }
      )
    }

    func webViewActionHandler(message: WKScriptMessage, replyHandler: WKScriptMessageReplyHandler?) {
      if let replyHandler = replyHandler {
        viewModel.webViewActionWithReplyHandler(
          message: message,
          replyHandler: replyHandler,
          dataService: dataService
        )
        return
      }

      if message.name == WebViewAction.highlightAction.rawValue {
        handleHighlightAction(message: message)
      }
    }

    private func handleHighlightAction(message: WKScriptMessage) {
      guard let messageBody = message.body as? [String: String] else { return }
      guard let actionID = messageBody["actionID"] else { return }

      switch actionID {
      case "annotate":
        annotation = messageBody["annotation"] ?? ""
        showHighlightAnnotationModal = true
      default:
        break
      }
    }

    var navBar: some View {
      HStack(alignment: .center) {
        Button(
          action: { self.presentationMode.wrappedValue.dismiss() },
          label: {
            Image(systemName: "chevron.backward")
              .font(.appTitleTwo)
              .foregroundColor(.appGrayTextContrast)
              .padding(.horizontal)
          }
        )
        .scaleEffect(navBarVisibilityRatio)
        Spacer()
        Button(
          action: { showFontSizePopover.toggle() },
          label: {
            Image(systemName: "textformat.size")
              .font(.appTitleTwo)
          }
        )
        .padding(.horizontal)
        .scaleEffect(navBarVisibilityRatio)
        Menu(
          content: {
            Group {
              Button(
                action: { showLabelsModal = true },
                label: { Label("Edit Labels", systemImage: "tag") }
              )
              Button(
                action: {
                  dataService.archiveLink(objectID: item.objectID, archived: !item.isArchived)
                  Snackbar.show(message: !item.isArchived ? "Link archived" : "Link moved to Inbox")
                },
                label: {
                  Label(
                    item.isArchived ? "Unarchive" : "Archive",
                    systemImage: item.isArchived ? "tray.and.arrow.down.fill" : "archivebox"
                  )
                }
              )
              Button(
                action: { shareActionID = UUID() },
                label: { Label("Share Original", systemImage: "square.and.arrow.up") }
              )
              Button(
                action: { showDeleteConfirmation = true },
                label: { Label("Delete", systemImage: "trash") }
              )
            }
          },
          label: {
            Image.profile
              .padding(.horizontal)
              .scaleEffect(navBarVisibilityRatio)
          }
        )
      }
      .frame(height: readerViewNavBarHeight * navBarVisibilityRatio)
      .opacity(navBarVisibilityRatio)
      .background(Color.systemBackground)
      .onTapGesture {
        showFontSizePopover = false
      }
      .alert("Are you sure?", isPresented: $showDeleteConfirmation) {
        Button("Remove Link", role: .destructive) {
          Snackbar.show(message: "Link removed")
          dataService.removeLink(objectID: item.objectID)
        }
        Button("Cancel", role: .cancel, action: {})
      }
      .sheet(isPresented: $showLabelsModal) {
        ApplyLabelsView(mode: .item(item), onSave: { _ in showLabelsModal = false })
      }
    }

    var body: some View {
      ZStack {
        if let articleContent = viewModel.articleContent {
          WebReader(
            htmlContent: articleContent.htmlContent,
            highlightsJSONString: articleContent.highlightsJSONString,
            item: item,
            openLinkAction: {
              #if os(macOS)
                NSWorkspace.shared.open($0)
              #elseif os(iOS)
                safariWebLink = SafariWebLink(id: UUID(), url: $0)
              #endif
            },
            webViewActionHandler: webViewActionHandler,
            navBarVisibilityRatioUpdater: {
              if $0 < 1 {
                showFontSizePopover = false
              }
              navBarVisibilityRatio = $0
            },
            increaseFontActionID: $increaseFontActionID,
            decreaseFontActionID: $decreaseFontActionID,
            annotationSaveTransactionID: $annotationSaveTransactionID,
            showNavBarActionID: $showNavBarActionID,
            shareActionID: $shareActionID,
            annotation: $annotation
          )
          .onTapGesture {
            withAnimation {
              navBarVisibilityRatio = 1
              showNavBarActionID = UUID()
            }
          }
          .sheet(item: $safariWebLink) {
            SafariView(url: $0.url)
          }
          .sheet(isPresented: $showHighlightAnnotationModal) {
            HighlightAnnotationSheet(
              annotation: $annotation,
              onSave: {
                annotationSaveTransactionID = UUID()
                showHighlightAnnotationModal = false
              },
              onCancel: {
                showHighlightAnnotationModal = false
              }
            )
          }
          .overlay(
            Group {
              if showOverlay {
                ZStack {
                  Color.systemBackground
                    .transition(.opacity)
                  if showLaunchImageOnOverlay {
                    Image("LaunchImage")
                  }
                }
              }
            }
          )
          .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in
            showOverlay = true
            showLaunchImageOnOverlay = true
          }
          .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            showLaunchImageOnOverlay = false
          }
          .onChange(of: scenePhase) { phase in
            if phase == .active {
              DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(100)) {
                withAnimation(.linear(duration: 0.2)) {
                  showOverlay = false
                }
              }
            }
          }
        } else if let errorMessage = viewModel.errorMessage {
          Text(errorMessage).padding()
        } else {
          ProgressView()
            .opacity(progressViewOpacity)
            .onAppear {
              DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(1000)) {
                progressViewOpacity = 1
              }
            }
            .task {
              await viewModel.loadContent(dataService: dataService, itemID: item.unwrappedID)
            }
        }
        if showFontSizePopover {
          VStack {
            Color.clear
              .contentShape(Rectangle())
              .frame(height: LinkItemDetailView.navBarHeight)
            HStack {
              Spacer()
              fontAdjustmentPopoverView
                .background(Color.appButtonBackground)
                .cornerRadius(8)
                .padding(.trailing, 44)
            }
            Spacer()
          }
          .background(
            Color.clear
              .contentShape(Rectangle())
              .onTapGesture {
                showFontSizePopover = false
              }
          )
        }
        VStack(spacing: 0) {
          navBar
          Spacer()
        }
      }.onDisappear {
        // Clear the shared webview content when exiting
        WebViewManager.shared().loadHTMLString("<html></html>", baseURL: nil)
      }
    }
  }
#endif
