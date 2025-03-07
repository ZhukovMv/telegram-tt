import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from '../../../lib/teact/teact';
import { requestMeasure, requestNextMutation } from '../../../lib/fasterdom/fasterdom';
import { getActions, withGlobal } from '../../../global';

import type {
  TabState, MessageListType, GlobalState, ApiDraft, MessageList,
} from '../../../global/types';
import type {
  ApiAttachment,
  ApiBotInlineResult,
  ApiBotInlineMediaResult,
  ApiSticker,
  ApiVideo,
  ApiNewPoll,
  ApiMessage,
  ApiFormattedText,
  ApiChat,
  ApiChatMember,
  ApiUser,
  ApiBotCommand,
  ApiBotMenuButton,
  ApiAttachMenuPeerType,
  ApiChatFullInfo,
} from '../../../api/types';
import type { InlineBotSettings, ISettings } from '../../../types';

import {
  BASE_EMOJI_KEYWORD_LANG,
  EDITABLE_INPUT_ID,
  REPLIES_USER_ID,
  SEND_MESSAGE_ACTION_INTERVAL,
  EDITABLE_INPUT_CSS_SELECTOR,
  MAX_UPLOAD_FILEPART_SIZE,
  EDITABLE_INPUT_MODAL_ID,
  SCHEDULED_WHEN_ONLINE,
} from '../../../config';
import { IS_VOICE_RECORDING_SUPPORTED, IS_IOS } from '../../../util/windowEnvironment';
import { MEMO_EMPTY_ARRAY } from '../../../util/memo';
import {
  selectCanScheduleUntilOnline,
  selectChat,
  selectBot,
  selectChatFullInfo,
  selectChatMessage,
  selectChatType,
  selectCurrentMessageList,
  selectDraft,
  selectEditingDraft,
  selectEditingMessage,
  selectEditingScheduledDraft,
  selectIsChatWithSelf,
  selectIsCurrentUserPremium,
  selectIsInSelectMode,
  selectIsRightColumnShown,
  selectNewestMessageWithBotKeyboardButtons,
  selectReplyingToId,
  selectRequestedDraftFiles,
  selectRequestedDraftText,
  selectScheduledIds,
  selectTabState,
  selectTheme,
  selectUser,
  selectUserFullInfo,
} from '../../../global/selectors';
import {
  getAllowedAttachmentOptions,
  isChatAdmin,
  isChatChannel,
  isChatSuperGroup,
  isUserId,
} from '../../../global/helpers';
import { formatMediaDuration, formatVoiceRecordDuration } from '../../../util/dateFormat';
import focusEditableElement from '../../../util/focusEditableElement';
import parseMessageInput from '../../../util/parseMessageInput';
import buildAttachment, { prepareAttachmentsToSend } from './helpers/buildAttachment';
import renderText from '../../common/helpers/renderText';
import { insertHtmlInSelection } from '../../../util/selection';
import deleteLastCharacterOutsideSelection from '../../../util/deleteLastCharacterOutsideSelection';
import buildClassName from '../../../util/buildClassName';
import windowSize from '../../../util/windowSize';
import { isSelectionInsideInput } from './helpers/selection';
import applyIosAutoCapitalizationFix from './helpers/applyIosAutoCapitalizationFix';
import { getServerTime } from '../../../util/serverTime';
import { selectCurrentLimit } from '../../../global/selectors/limits';
import { buildCustomEmojiHtml } from './helpers/customEmoji';
import { processMessageInputForCustomEmoji } from '../../../util/customEmojiManager';
import { getTextWithEntitiesAsHtml } from '../../common/helpers/renderTextWithEntities';

import useLastCallback from '../../../hooks/useLastCallback';
import useSignal from '../../../hooks/useSignal';
import useFlag from '../../../hooks/useFlag';
import usePrevious from '../../../hooks/usePrevious';
import useStickerTooltip from './hooks/useStickerTooltip';
import useContextMenuHandlers from '../../../hooks/useContextMenuHandlers';
import useLang from '../../../hooks/useLang';
import useSendMessageAction from '../../../hooks/useSendMessageAction';
import useInterval from '../../../hooks/useInterval';
import useSyncEffect from '../../../hooks/useSyncEffect';
import useVoiceRecording from './hooks/useVoiceRecording';
import useClipboardPaste from './hooks/useClipboardPaste';
import useEditing from './hooks/useEditing';
import useEmojiTooltip from './hooks/useEmojiTooltip';
import useMentionTooltip from './hooks/useMentionTooltip';
import useInlineBotTooltip from './hooks/useInlineBotTooltip';
import useBotCommandTooltip from './hooks/useBotCommandTooltip';
import useSchedule from '../../../hooks/useSchedule';
import useCustomEmojiTooltip from './hooks/useCustomEmojiTooltip';
import useAttachmentModal from './hooks/useAttachmentModal';
import useGetSelectionRange from '../../../hooks/useGetSelectionRange';
import useDerivedState from '../../../hooks/useDerivedState';
import { useStateRef } from '../../../hooks/useStateRef';
import useEffectWithPrevDeps from '../../../hooks/useEffectWithPrevDeps';
import useDraft from './hooks/useDraft';
import useTimeout from '../../../hooks/useTimeout';

import DeleteMessageModal from '../../common/DeleteMessageModal.async';
import Button from '../../ui/Button';
import ResponsiveHoverButton from '../../ui/ResponsiveHoverButton';
import Spinner from '../../ui/Spinner';
import AttachMenu from './AttachMenu';
import Avatar from '../../common/Avatar';
import InlineBotTooltip from './InlineBotTooltip.async';
import MentionTooltip from './MentionTooltip.async';
import CustomSendMenu from './CustomSendMenu.async';
import StickerTooltip from './StickerTooltip.async';
import CustomEmojiTooltip from './CustomEmojiTooltip.async';
import EmojiTooltip from './EmojiTooltip.async';
import BotCommandTooltip from './BotCommandTooltip.async';
import BotKeyboardMenu from './BotKeyboardMenu';
import MessageInput from './MessageInput';
import ComposerEmbeddedMessage from './ComposerEmbeddedMessage';
import AttachmentModal from './AttachmentModal.async';
import BotCommandMenu from './BotCommandMenu.async';
import PollModal from './PollModal.async';
import DropArea, { DropAreaState } from './DropArea.async';
import WebPagePreview from './WebPagePreview';
import SendAsMenu from './SendAsMenu.async';
import BotMenuButton from './BotMenuButton';
import SymbolMenuButton from './SymbolMenuButton';

import './Composer.scss';

type OwnProps = {
  chatId: string;
  threadId: number;
  messageListType: MessageListType;
  dropAreaState: string;
  isReady: boolean;
  isMobile?: boolean;
  onDropHide: NoneToVoidFunction;
};

type StateProps =
  {
    isOnActiveTab: boolean;
    editingMessage?: ApiMessage;
    chat?: ApiChat;
    draft?: ApiDraft;
    currentMessageList?: MessageList;
    isChatWithBot?: boolean;
    isChatWithSelf?: boolean;
    isChannel?: boolean;
    replyingToId?: number;
    isForCurrentMessageList: boolean;
    isRightColumnShown?: boolean;
    isSelectModeActive?: boolean;
    isForwarding?: boolean;
    pollModal: TabState['pollModal'];
    botKeyboardMessageId?: number;
    botKeyboardPlaceholder?: string;
    withScheduledButton?: boolean;
    shouldSchedule?: boolean;
    canScheduleUntilOnline?: boolean;
    stickersForEmoji?: ApiSticker[];
    customEmojiForEmoji?: ApiSticker[];
    groupChatMembers?: ApiChatMember[];
    currentUserId?: string;
    recentEmojis: string[];
    lastSyncTime?: number;
    contentToBeScheduled?: TabState['contentToBeScheduled'];
    shouldSuggestStickers?: boolean;
    shouldSuggestCustomEmoji?: boolean;
    baseEmojiKeywords?: Record<string, string[]>;
    emojiKeywords?: Record<string, string[]>;
    topInlineBotIds?: string[];
    isInlineBotLoading: boolean;
    inlineBots?: Record<string, false | InlineBotSettings>;
    botCommands?: ApiBotCommand[] | false;
    botMenuButton?: ApiBotMenuButton;
    chatBotCommands?: ApiBotCommand[];
    sendAsUser?: ApiUser;
    sendAsChat?: ApiChat;
    sendAsId?: string;
    editingDraft?: ApiFormattedText;
    requestedDraftText?: string;
    requestedDraftFiles?: File[];
    attachBots: GlobalState['attachMenu']['bots'];
    attachMenuPeerType?: ApiAttachMenuPeerType;
    theme: ISettings['theme'];
    fileSizeLimit: number;
    captionLimit: number;
    isCurrentUserPremium?: boolean;
    canSendVoiceByPrivacy?: boolean;
    attachmentSettings: GlobalState['attachmentSettings'];
    slowMode?: ApiChatFullInfo['slowMode'];
    shouldUpdateStickerSetOrder?: boolean;
  }
  & Pick<GlobalState, 'connectionState'>;

enum MainButtonState {
  Send = 'send',
  Record = 'record',
  Edit = 'edit',
  Schedule = 'schedule',
}

type ScheduledMessageArgs = TabState['contentToBeScheduled'] | {
  id: string; queryId: string; isSilent?: boolean;
};

const VOICE_RECORDING_FILENAME = 'wonderful-voice-message.ogg';
// When voice recording is active, composer placeholder will hide to prevent overlapping
const SCREEN_WIDTH_TO_HIDE_PLACEHOLDER = 600; // px

const MOBILE_KEYBOARD_HIDE_DELAY_MS = 100;
const SELECT_MODE_TRANSITION_MS = 200;
const MESSAGE_MAX_LENGTH = 4096;
const SENDING_ANIMATION_DURATION = 350;
const MOUNT_ANIMATION_DURATION = 430;
// eslint-disable-next-line max-len
const APPENDIX = '<svg width="9" height="20" xmlns="http://www.w3.org/2000/svg"><defs><filter x="-50%" y="-14.7%" width="200%" height="141.2%" filterUnits="objectBoundingBox" id="a"><feOffset dy="1" in="SourceAlpha" result="shadowOffsetOuter1"/><feGaussianBlur stdDeviation="1" in="shadowOffsetOuter1" result="shadowBlurOuter1"/><feColorMatrix values="0 0 0 0 0.0621962482 0 0 0 0 0.138574144 0 0 0 0 0.185037364 0 0 0 0.15 0" in="shadowBlurOuter1"/></filter></defs><g fill="none" fill-rule="evenodd"><path d="M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z" fill="#000" filter="url(#a)"/><path d="M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z" fill="#FFF" class="corner"/></g></svg>';

const Composer: FC<OwnProps & StateProps> = ({
  isOnActiveTab,
  dropAreaState,
  shouldSchedule,
  canScheduleUntilOnline,
  isReady,
  isMobile,
  onDropHide,
  editingMessage,
  chatId,
  threadId,
  currentMessageList,
  messageListType,
  draft,
  chat,
  isForCurrentMessageList,
  isCurrentUserPremium,
  canSendVoiceByPrivacy,
  connectionState,
  isChatWithBot,
  isChatWithSelf,
  isChannel,
  fileSizeLimit,
  isRightColumnShown,
  isSelectModeActive,
  isForwarding,
  pollModal,
  botKeyboardMessageId,
  botKeyboardPlaceholder,
  withScheduledButton,
  stickersForEmoji,
  customEmojiForEmoji,
  groupChatMembers,
  topInlineBotIds,
  currentUserId,
  captionLimit,
  lastSyncTime,
  contentToBeScheduled,
  shouldSuggestStickers,
  shouldSuggestCustomEmoji,
  baseEmojiKeywords,
  emojiKeywords,
  recentEmojis,
  inlineBots,
  isInlineBotLoading,
  botCommands,
  chatBotCommands,
  sendAsUser,
  sendAsChat,
  sendAsId,
  editingDraft,
  replyingToId,
  requestedDraftText,
  requestedDraftFiles,
  botMenuButton,
  attachBots,
  attachMenuPeerType,
  attachmentSettings,
  theme,
  slowMode,
  shouldUpdateStickerSetOrder,
}) => {
  const {
    sendMessage,
    clearDraft,
    showDialog,
    forwardMessages,
    openPollModal,
    closePollModal,
    loadScheduledHistory,
    openChat,
    addRecentEmoji,
    sendInlineBotResult,
    loadSendAs,
    resetOpenChatWithDraft,
    callAttachBot,
    addRecentCustomEmoji,
    showNotification,
    showAllowedMessageTypesNotification,
  } = getActions();

  const lang = useLang();

  // eslint-disable-next-line no-null/no-null
  const appendixRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const inputRef = useRef<HTMLDivElement>(null);

  const [getHtml, setHtml] = useSignal('');
  const [isMounted, setIsMounted] = useState(false);
  const getSelectionRange = useGetSelectionRange(EDITABLE_INPUT_CSS_SELECTOR);
  const lastMessageSendTimeSeconds = useRef<number>();
  const prevDropAreaState = usePrevious(dropAreaState);
  const { width: windowWidth } = windowSize.get();
  const sendAsPeerIds = chat?.sendAsPeerIds;
  const canShowSendAs = sendAsPeerIds
    && (sendAsPeerIds.length > 1 || !sendAsPeerIds.some((peer) => peer.id === currentUserId!));
  // Prevent Symbol Menu from closing when calendar is open
  const [isSymbolMenuForced, forceShowSymbolMenu, cancelForceShowSymbolMenu] = useFlag();
  const sendMessageAction = useSendMessageAction(chatId, threadId);

  useEffect(processMessageInputForCustomEmoji, [getHtml]);

  const customEmojiNotificationNumber = useRef(0);

  const [requestCalendar, calendar] = useSchedule(canScheduleUntilOnline, cancelForceShowSymbolMenu);

  useTimeout(() => {
    setIsMounted(true);
  }, MOUNT_ANIMATION_DURATION);

  useEffect(() => {
    lastMessageSendTimeSeconds.current = undefined;
  }, [chatId]);

  useEffect(() => {
    if (chatId && lastSyncTime && isReady) {
      loadScheduledHistory({ chatId });
    }
  }, [isReady, chatId, loadScheduledHistory, lastSyncTime, threadId]);

  useEffect(() => {
    if (chatId && chat && lastSyncTime && !sendAsPeerIds && isReady && isChatSuperGroup(chat)) {
      loadSendAs({ chatId });
    }
  }, [chat, chatId, isReady, lastSyncTime, loadSendAs, sendAsPeerIds]);

  const shouldAnimateSendAsButtonRef = useRef(false);
  useSyncEffect(([prevChatId, prevSendAsPeerIds]) => {
    // We only animate send-as button if `sendAsPeerIds` was missing when opening the chat
    shouldAnimateSendAsButtonRef.current = Boolean(chatId === prevChatId && sendAsPeerIds && !prevSendAsPeerIds);
  }, [chatId, sendAsPeerIds]);

  useLayoutEffect(() => {
    if (!appendixRef.current) return;

    appendixRef.current.innerHTML = APPENDIX;
  }, []);

  const [attachments, setAttachments] = useState<ApiAttachment[]>([]);
  const hasAttachments = Boolean(attachments.length);

  const {
    canSendStickers, canSendGifs, canAttachMedia, canAttachPolls, canAttachEmbedLinks,
    canSendVoices, canSendPlainText, canSendAudios, canSendVideos, canSendPhotos, canSendDocuments,
  } = useMemo(() => getAllowedAttachmentOptions(chat, isChatWithBot), [chat, isChatWithBot]);

  const isComposerBlocked = !canSendPlainText && !editingMessage;

  const {
    shouldSuggestCompression,
    shouldForceCompression,
    shouldForceAsFile,
    handleAppendFiles,
    handleFileSelect,
    onCaptionUpdate,
    handleClearAttachments,
    handleSetAttachments,
  } = useAttachmentModal({
    attachments,
    setHtml,
    setAttachments,
    fileSizeLimit,
    chatId,
    canSendAudios,
    canSendVideos,
    canSendPhotos,
    canSendDocuments,
  });

  const [isBotKeyboardOpen, openBotKeyboard, closeBotKeyboard] = useFlag();
  const [isBotCommandMenuOpen, openBotCommandMenu, closeBotCommandMenu] = useFlag();
  const [isSymbolMenuOpen, openSymbolMenu, closeSymbolMenu] = useFlag();
  const [isSendAsMenuOpen, openSendAsMenu, closeSendAsMenu] = useFlag();
  const [isDeleteModalOpen, openDeleteModal, closeDeleteModal] = useFlag();
  const [isHoverDisabled, disableHover, enableHover] = useFlag();

  const {
    startRecordingVoice,
    stopRecordingVoice,
    pauseRecordingVoice,
    activeVoiceRecording,
    currentRecordTime,
    recordButtonRef: mainButtonRef,
    startRecordTimeRef,
  } = useVoiceRecording();

  useInterval(() => {
    sendMessageAction({ type: 'recordAudio' });
  }, activeVoiceRecording && SEND_MESSAGE_ACTION_INTERVAL);

  useEffect(() => {
    if (!activeVoiceRecording) {
      sendMessageAction({ type: 'cancel' });
    }
  }, [activeVoiceRecording, sendMessageAction]);

  const isEditingRef = useStateRef(Boolean(editingMessage));
  useEffect(() => {
    if (getHtml() && !isEditingRef.current) {
      sendMessageAction({ type: 'typing' });
    }
  }, [getHtml, isEditingRef, sendMessageAction]);

  const isAdmin = chat && isChatAdmin(chat);

  const {
    isEmojiTooltipOpen,
    closeEmojiTooltip,
    filteredEmojis,
    filteredCustomEmojis,
    insertEmoji,
  } = useEmojiTooltip(
    Boolean(isReady && isOnActiveTab && isForCurrentMessageList && shouldSuggestStickers && !hasAttachments),
    getHtml,
    setHtml,
    undefined,
    recentEmojis,
    baseEmojiKeywords,
    emojiKeywords,
  );

  const {
    isCustomEmojiTooltipOpen,
    closeCustomEmojiTooltip,
    insertCustomEmoji,
  } = useCustomEmojiTooltip(
    Boolean(isReady && isOnActiveTab && isForCurrentMessageList && shouldSuggestCustomEmoji && !hasAttachments),
    getHtml,
    setHtml,
    getSelectionRange,
    inputRef,
    customEmojiForEmoji,
  );

  const {
    isStickerTooltipOpen,
    closeStickerTooltip,
  } = useStickerTooltip(
    Boolean(isReady
      && isOnActiveTab
      && isForCurrentMessageList
      && shouldSuggestStickers
      && canSendStickers
      && !hasAttachments),
    getHtml,
    stickersForEmoji,
  );

  const {
    isMentionTooltipOpen,
    closeMentionTooltip,
    insertMention,
    mentionFilteredUsers,
  } = useMentionTooltip(
    Boolean(isReady && isForCurrentMessageList && !hasAttachments),
    getHtml,
    setHtml,
    getSelectionRange,
    inputRef,
    groupChatMembers,
    topInlineBotIds,
    currentUserId,
  );

  const {
    isOpen: isInlineBotTooltipOpen,
    botId: inlineBotId,
    isGallery: isInlineBotTooltipGallery,
    switchPm: inlineBotSwitchPm,
    switchWebview: inlineBotSwitchWebview,
    results: inlineBotResults,
    closeTooltip: closeInlineBotTooltip,
    help: inlineBotHelp,
    loadMore: loadMoreForInlineBot,
  } = useInlineBotTooltip(
    Boolean(isReady && isForCurrentMessageList && !hasAttachments && lastSyncTime),
    chatId,
    getHtml,
    inlineBots,
  );

  const {
    isOpen: isBotCommandTooltipOpen,
    close: closeBotCommandTooltip,
    filteredBotCommands: botTooltipCommands,
  } = useBotCommandTooltip(
    Boolean(isReady && isForCurrentMessageList && ((botCommands && botCommands?.length) || chatBotCommands?.length)),
    getHtml,
    botCommands,
    chatBotCommands,
  );

  const insertHtmlAndUpdateCursor = useLastCallback((newHtml: string, inputId: string = EDITABLE_INPUT_ID) => {
    if (inputId === EDITABLE_INPUT_ID && isComposerBlocked) return;
    const selection = window.getSelection()!;
    let messageInput: HTMLDivElement;
    if (inputId === EDITABLE_INPUT_ID) {
      messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR)!;
    } else {
      messageInput = document.getElementById(inputId) as HTMLDivElement;
    }

    if (selection.rangeCount) {
      const selectionRange = selection.getRangeAt(0);
      if (isSelectionInsideInput(selectionRange, inputId)) {
        insertHtmlInSelection(newHtml);
        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }

    setHtml(`${getHtml()}${newHtml}`);

    // If selection is outside of input, set cursor at the end of input
    requestNextMutation(() => {
      focusEditableElement(messageInput);
    });
  });

  const insertFormattedTextAndUpdateCursor = useLastCallback((
    text: ApiFormattedText, inputId: string = EDITABLE_INPUT_ID,
  ) => {
    const newHtml = getTextWithEntitiesAsHtml(text);
    insertHtmlAndUpdateCursor(newHtml, inputId);
  });

  const insertCustomEmojiAndUpdateCursor = useLastCallback((emoji: ApiSticker, inputId: string = EDITABLE_INPUT_ID) => {
    insertHtmlAndUpdateCursor(buildCustomEmojiHtml(emoji), inputId);
  });

  useDraft(draft, chatId, threadId, getHtml, setHtml, editingMessage, lastSyncTime);

  const resetComposer = useLastCallback((shouldPreserveInput = false) => {
    if (!shouldPreserveInput) {
      setHtml('');
    }

    setAttachments(MEMO_EMPTY_ARRAY);

    closeEmojiTooltip();
    closeCustomEmojiTooltip();
    closeStickerTooltip();
    closeMentionTooltip();

    if (isMobile) {
      // @optimization
      setTimeout(() => closeSymbolMenu(), SENDING_ANIMATION_DURATION);
    } else {
      closeSymbolMenu();
    }
  });

  const [handleEditComplete, handleEditCancel, shouldForceShowEditing] = useEditing(
    getHtml,
    setHtml,
    editingMessage,
    resetComposer,
    openDeleteModal,
    chatId,
    threadId,
    messageListType,
    draft,
    editingDraft,
    replyingToId,
  );

  // Handle chat change (should be placed after `useDraft` and `useEditing`)
  const resetComposerRef = useStateRef(resetComposer);
  const stopRecordingVoiceRef = useStateRef(stopRecordingVoice);
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
      stopRecordingVoiceRef.current();
      // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
      resetComposerRef.current();
    };
  }, [chatId, threadId, resetComposerRef, stopRecordingVoiceRef]);

  const showCustomEmojiPremiumNotification = useLastCallback(() => {
    const notificationNumber = customEmojiNotificationNumber.current;
    if (!notificationNumber) {
      showNotification({
        message: lang('UnlockPremiumEmojiHint'),
        action: {
          action: 'openPremiumModal',
          payload: { initialSection: 'animated_emoji' },
        },
        actionText: lang('PremiumMore'),
      });
    } else {
      showNotification({
        message: lang('UnlockPremiumEmojiHint2'),
        action: {
          action: 'openChat',
          payload: { id: currentUserId, shouldReplaceHistory: true },
        },
        actionText: lang('Open'),
      });
    }
    customEmojiNotificationNumber.current = Number(!notificationNumber);
  });

  const mainButtonState = useDerivedState(() => {
    if (editingMessage && shouldForceShowEditing) {
      return MainButtonState.Edit;
    }

    if (IS_VOICE_RECORDING_SUPPORTED && !activeVoiceRecording && !isForwarding && !(getHtml() && !hasAttachments)) {
      return MainButtonState.Record;
    }

    if (shouldSchedule) {
      return MainButtonState.Schedule;
    }

    return MainButtonState.Send;
  }, [
    activeVoiceRecording, editingMessage, getHtml, hasAttachments, isForwarding, shouldForceShowEditing, shouldSchedule,
  ]);
  const canShowCustomSendMenu = !shouldSchedule;

  const {
    isContextMenuOpen: isCustomSendMenuOpen,
    handleContextMenu,
    handleContextMenuClose,
    handleContextMenuHide,
  } = useContextMenuHandlers(mainButtonRef, !(mainButtonState === MainButtonState.Send && canShowCustomSendMenu));

  useClipboardPaste(
    isForCurrentMessageList,
    insertFormattedTextAndUpdateCursor,
    handleSetAttachments,
    editingMessage,
    !isCurrentUserPremium && !isChatWithSelf,
    showCustomEmojiPremiumNotification,
  );

  const handleEmbeddedClear = useLastCallback(() => {
    if (editingMessage) {
      handleEditCancel();
    }
  });

  const validateTextLength = useLastCallback((text: string, isAttachmentModal?: boolean) => {
    const maxLength = isAttachmentModal ? captionLimit : MESSAGE_MAX_LENGTH;
    if (text?.length > maxLength) {
      const extraLength = text.length - maxLength;
      showDialog({
        data: {
          message: 'MESSAGE_TOO_LONG_PLEASE_REMOVE_CHARACTERS',
          textParams: {
            '{EXTRA_CHARS_COUNT}': extraLength.toString(),
            '{PLURAL_S}': extraLength > 1 ? 's' : '',
          },
          hasErrorKey: true,
        },
      });

      return false;
    }
    return true;
  });

  const checkSlowMode = useLastCallback(() => {
    if (slowMode && !isAdmin) {
      const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);

      const nowSeconds = getServerTime();
      const secondsSinceLastMessage = lastMessageSendTimeSeconds.current
        && Math.floor(nowSeconds - lastMessageSendTimeSeconds.current);
      const nextSendDateNotReached = slowMode.nextSendDate && slowMode.nextSendDate > nowSeconds;

      if (
        (secondsSinceLastMessage && secondsSinceLastMessage < slowMode.seconds)
        || nextSendDateNotReached
      ) {
        const secondsRemaining = nextSendDateNotReached
          ? slowMode.nextSendDate! - nowSeconds
          : slowMode.seconds - secondsSinceLastMessage!;
        showDialog({
          data: {
            message: lang('SlowModeHint', formatMediaDuration(secondsRemaining)),
            isSlowMode: true,
            hasErrorKey: false,
          },
        });

        messageInput?.blur();

        return false;
      }
    }
    return true;
  });

  const sendAttachments = useLastCallback(({
    attachments: attachmentsToSend,
    sendCompressed = attachmentSettings.shouldCompress,
    sendGrouped = attachmentSettings.shouldSendGrouped,
    isSilent,
    scheduledAt,
  }: {
    attachments: ApiAttachment[];
    sendCompressed?: boolean;
    sendGrouped?: boolean;
    isSilent?: boolean;
    scheduledAt?: number;
  }) => {
    if (connectionState !== 'connectionStateReady' || !currentMessageList) {
      return;
    }

    const { text, entities } = parseMessageInput(getHtml());
    if (!text && !attachmentsToSend.length) {
      return;
    }
    if (!validateTextLength(text, true)) return;
    if (!checkSlowMode()) return;

    sendMessage({
      messageList: currentMessageList,
      text,
      entities,
      scheduledAt,
      isSilent,
      shouldUpdateStickerSetOrder,
      attachments: prepareAttachmentsToSend(attachmentsToSend, sendCompressed),
      shouldGroupMessages: sendGrouped,
    });

    lastMessageSendTimeSeconds.current = getServerTime();

    clearDraft({ chatId, localOnly: true });

    // Wait until message animation starts
    requestMeasure(() => {
      resetComposer();
    });
  });

  const handleSendAttachments = useLastCallback((
    sendCompressed: boolean,
    sendGrouped: boolean,
    isSilent?: boolean,
    scheduledAt?: number,
  ) => {
    sendAttachments({
      attachments,
      sendCompressed,
      sendGrouped,
      isSilent,
      scheduledAt,
    });
  });

  const handleSend = useLastCallback(async (isSilent = false, scheduledAt?: number) => {
    if (connectionState !== 'connectionStateReady' || !currentMessageList) {
      return;
    }

    let currentAttachments = attachments;

    if (activeVoiceRecording) {
      const record = await stopRecordingVoice();
      if (record) {
        const { blob, duration, waveform } = record;
        currentAttachments = [await buildAttachment(
          VOICE_RECORDING_FILENAME,
          blob,
          { voice: { duration, waveform } },
        )];
      }
    }

    const { text, entities } = parseMessageInput(getHtml());

    if (currentAttachments.length) {
      sendAttachments({
        attachments: currentAttachments,
      });
      return;
    }

    if (!text && !isForwarding) {
      return;
    }

    if (!validateTextLength(text)) return;

    const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);

    if (text) {
      if (!checkSlowMode()) return;

      sendMessage({
        messageList: currentMessageList,
        text,
        entities,
        scheduledAt,
        isSilent,
        shouldUpdateStickerSetOrder,
      });
    }

    if (isForwarding) {
      forwardMessages({
        scheduledAt,
        isSilent,
      });
    }

    lastMessageSendTimeSeconds.current = getServerTime();

    clearDraft({ chatId, localOnly: true });

    if (IS_IOS && messageInput && messageInput === document.activeElement) {
      applyIosAutoCapitalizationFix(messageInput);
    }

    // Wait until message animation starts
    requestMeasure(() => {
      resetComposer();
    });
  });

  const handleClickBotMenu = useLastCallback(() => {
    if (botMenuButton?.type !== 'webApp') {
      return;
    }

    callAttachBot({
      chatId, url: botMenuButton.url, threadId,
    });
  });

  const handleActivateBotCommandMenu = useLastCallback(() => {
    closeSymbolMenu();
    openBotCommandMenu();
  });

  const handleMessageSchedule = useLastCallback((
    args: ScheduledMessageArgs, scheduledAt: number, messageList: MessageList,
  ) => {
    if (args && 'queryId' in args) {
      const { id, queryId, isSilent } = args;
      sendInlineBotResult({
        id,
        queryId,
        scheduledAt,
        isSilent,
        messageList,
      });
      return;
    }

    const { isSilent, ...restArgs } = args || {};

    if (!args || Object.keys(restArgs).length === 0) {
      void handleSend(Boolean(isSilent), scheduledAt);
    } else if (args.sendCompressed !== undefined || args.sendGrouped !== undefined) {
      const { sendCompressed = false, sendGrouped = false } = args;
      void handleSendAttachments(sendCompressed, sendGrouped, isSilent, scheduledAt);
    } else {
      sendMessage({
        ...args,
        messageList,
        scheduledAt,
      });
    }
  });

  useEffectWithPrevDeps(([prevContentToBeScheduled]) => {
    if (currentMessageList && contentToBeScheduled && contentToBeScheduled !== prevContentToBeScheduled) {
      requestCalendar((scheduledAt) => {
        handleMessageSchedule(contentToBeScheduled, scheduledAt, currentMessageList);
      });
    }
  }, [contentToBeScheduled, currentMessageList, handleMessageSchedule, requestCalendar]);

  useEffect(() => {
    if (requestedDraftText) {
      setHtml(requestedDraftText);
      resetOpenChatWithDraft();

      requestNextMutation(() => {
        const messageInput = document.getElementById(EDITABLE_INPUT_ID)!;
        focusEditableElement(messageInput, true);
      });
    }
  }, [requestedDraftText, resetOpenChatWithDraft, setHtml]);

  useEffect(() => {
    if (requestedDraftFiles?.length) {
      void handleFileSelect(requestedDraftFiles);
      resetOpenChatWithDraft();
    }
  }, [handleFileSelect, requestedDraftFiles, resetOpenChatWithDraft]);

  const handleCustomEmojiSelect = useLastCallback((emoji: ApiSticker, inputId?: string) => {
    if (!emoji.isFree && !isCurrentUserPremium && !isChatWithSelf) {
      showCustomEmojiPremiumNotification();
      return;
    }

    insertCustomEmojiAndUpdateCursor(emoji, inputId);
  });

  const handleCustomEmojiSelectAttachmentModal = useLastCallback((emoji: ApiSticker) => {
    handleCustomEmojiSelect(emoji, EDITABLE_INPUT_MODAL_ID);
  });

  const handleGifSelect = useLastCallback((gif: ApiVideo, isSilent?: boolean, isScheduleRequested?: boolean) => {
    if (!currentMessageList) {
      return;
    }

    if (shouldSchedule || isScheduleRequested) {
      forceShowSymbolMenu();
      requestCalendar((scheduledAt) => {
        cancelForceShowSymbolMenu();
        handleMessageSchedule({ gif, isSilent }, scheduledAt, currentMessageList);
        requestMeasure(() => {
          resetComposer(true);
        });
      });
    } else {
      sendMessage({ messageList: currentMessageList, gif, isSilent });
      requestMeasure(() => {
        resetComposer(true);
      });
    }
  });

  const handleStickerSelect = useLastCallback((
    sticker: ApiSticker,
    isSilent?: boolean,
    isScheduleRequested?: boolean,
    shouldPreserveInput = false,
    canUpdateStickerSetsOrder?: boolean,
  ) => {
    if (!currentMessageList) {
      return;
    }

    sticker = {
      ...sticker,
      isPreloadedGlobally: true,
    };

    if (shouldSchedule || isScheduleRequested) {
      forceShowSymbolMenu();
      requestCalendar((scheduledAt) => {
        cancelForceShowSymbolMenu();
        handleMessageSchedule({ sticker, isSilent }, scheduledAt, currentMessageList);
        requestMeasure(() => {
          resetComposer(shouldPreserveInput);
        });
      });
    } else {
      sendMessage({
        messageList: currentMessageList,
        sticker,
        isSilent,
        shouldUpdateStickerSetOrder: shouldUpdateStickerSetOrder && canUpdateStickerSetsOrder,
      });
      requestMeasure(() => {
        resetComposer(shouldPreserveInput);
      });
    }
  });

  const handleInlineBotSelect = useLastCallback((
    inlineResult: ApiBotInlineResult | ApiBotInlineMediaResult, isSilent?: boolean, isScheduleRequested?: boolean,
  ) => {
    if (connectionState !== 'connectionStateReady' || !currentMessageList) {
      return;
    }

    if (shouldSchedule || isScheduleRequested) {
      requestCalendar((scheduledAt) => {
        handleMessageSchedule({
          id: inlineResult.id,
          queryId: inlineResult.queryId,
          isSilent,
        }, scheduledAt, currentMessageList);
      });
    } else {
      sendInlineBotResult({
        id: inlineResult.id,
        queryId: inlineResult.queryId,
        isSilent,
        messageList: currentMessageList,
      });
    }

    const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);
    if (IS_IOS && messageInput && messageInput === document.activeElement) {
      applyIosAutoCapitalizationFix(messageInput);
    }

    clearDraft({ chatId, localOnly: true });
    requestMeasure(() => {
      resetComposer();
    });
  });

  const handleBotCommandSelect = useLastCallback(() => {
    clearDraft({ chatId, localOnly: true });
    requestMeasure(() => {
      resetComposer();
    });
  });

  const handlePollSend = useLastCallback((poll: ApiNewPoll) => {
    if (!currentMessageList) {
      return;
    }

    if (shouldSchedule) {
      requestCalendar((scheduledAt) => {
        handleMessageSchedule({ poll }, scheduledAt, currentMessageList);
      });
      closePollModal();
    } else {
      sendMessage({ messageList: currentMessageList, poll });
      closePollModal();
    }
  });

  const sendSilent = useLastCallback((additionalArgs?: ScheduledMessageArgs) => {
    if (shouldSchedule) {
      requestCalendar((scheduledAt) => {
        handleMessageSchedule({ ...additionalArgs, isSilent: true }, scheduledAt, currentMessageList!);
      });
    } else if (additionalArgs && ('sendCompressed' in additionalArgs || 'sendGrouped' in additionalArgs)) {
      const { sendCompressed = false, sendGrouped = false } = additionalArgs;
      void handleSendAttachments(sendCompressed, sendGrouped, true);
    } else {
      void handleSend(true);
    }
  });

  const handleSendAsMenuOpen = useLastCallback(() => {
    const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);

    if (!isMobile || messageInput !== document.activeElement) {
      closeBotCommandMenu();
      closeSymbolMenu();
      openSendAsMenu();
      return;
    }

    messageInput?.blur();
    setTimeout(() => {
      closeBotCommandMenu();
      closeSymbolMenu();
      openSendAsMenu();
    }, MOBILE_KEYBOARD_HIDE_DELAY_MS);
  });

  const insertTextAndUpdateCursor = useLastCallback((text: string, inputId: string = EDITABLE_INPUT_ID) => {
    const newHtml = renderText(text, ['escape_html', 'emoji_html', 'br_html'])
      .join('')
      .replace(/\u200b+/g, '\u200b');
    insertHtmlAndUpdateCursor(newHtml, inputId);
  });

  useEffect(() => {
    if (!isComposerBlocked) return;

    setHtml('');
  }, [isComposerBlocked, setHtml, attachments]);

  const insertTextAndUpdateCursorAttachmentModal = useLastCallback((text: string) => {
    insertTextAndUpdateCursor(text, EDITABLE_INPUT_MODAL_ID);
  });

  const removeSymbol = useLastCallback((inputId = EDITABLE_INPUT_ID) => {
    const selection = window.getSelection()!;

    if (selection.rangeCount) {
      const selectionRange = selection.getRangeAt(0);
      if (isSelectionInsideInput(selectionRange, inputId)) {
        document.execCommand('delete', false);
        return;
      }
    }

    setHtml(deleteLastCharacterOutsideSelection(getHtml()));
  });

  const removeSymbolAttachmentModal = useLastCallback(() => {
    removeSymbol(EDITABLE_INPUT_MODAL_ID);
  });

  const handleAllScheduledClick = useLastCallback(() => {
    openChat({
      id: chatId, threadId, type: 'scheduled', noForumTopicPanel: true,
    });
  });

  useEffect(() => {
    if (isRightColumnShown && isMobile) {
      closeSymbolMenu();
    }
  }, [isRightColumnShown, closeSymbolMenu, isMobile]);

  useEffect(() => {
    if (!isReady) return;

    if (isSelectModeActive) {
      disableHover();
    } else {
      setTimeout(() => {
        enableHover();
      }, SELECT_MODE_TRANSITION_MS);
    }
  }, [isSelectModeActive, enableHover, disableHover, isReady]);

  const areVoiceMessagesNotAllowed = mainButtonState === MainButtonState.Record
    && (!canAttachMedia || !canSendVoiceByPrivacy || !canSendVoices);

  const mainButtonHandler = useLastCallback(() => {
    switch (mainButtonState) {
      case MainButtonState.Send:
        void handleSend();
        break;
      case MainButtonState.Record: {
        if (areVoiceMessagesNotAllowed) {
          if (!canSendVoiceByPrivacy) {
            showNotification({
              message: lang('VoiceMessagesRestrictedByPrivacy', chat?.title),
            });
          } else if (!canSendVoices) {
            showAllowedMessageTypesNotification({ chatId });
          }
        } else {
          void startRecordingVoice();
        }
        break;
      }
      case MainButtonState.Edit:
        handleEditComplete();
        break;
      case MainButtonState.Schedule:
        if (activeVoiceRecording) {
          pauseRecordingVoice();
        }
        if (!currentMessageList) {
          return;
        }

        requestCalendar((scheduledAt) => {
          handleMessageSchedule({}, scheduledAt, currentMessageList!);
        });
        break;
      default:
        break;
    }
  });

  const prevEditedMessage = usePrevious(editingMessage, true);
  const renderedEditedMessage = editingMessage || prevEditedMessage;

  const scheduledDefaultDate = new Date();
  scheduledDefaultDate.setSeconds(0);
  scheduledDefaultDate.setMilliseconds(0);

  const scheduledMaxDate = new Date();
  scheduledMaxDate.setFullYear(scheduledMaxDate.getFullYear() + 1);

  let sendButtonAriaLabel = 'SendMessage';
  switch (mainButtonState) {
    case MainButtonState.Edit:
      sendButtonAriaLabel = 'Save edited message';
      break;
    case MainButtonState.Record:
      sendButtonAriaLabel = !canAttachMedia
        ? 'Conversation.DefaultRestrictedMedia'
        : 'AccDescrVoiceMessage';
  }

  const className = buildClassName(
    'Composer',
    !isSelectModeActive && 'shown',
    isHoverDisabled && 'hover-disabled',
    isMounted && 'mounted',
  );

  const handleSendScheduled = useLastCallback(() => {
    requestCalendar((scheduledAt) => {
      handleMessageSchedule({}, scheduledAt, currentMessageList!);
    });
  });

  const handleSendSilent = useLastCallback(() => {
    sendSilent();
  });

  const handleSendWhenOnline = useLastCallback(() => {
    handleMessageSchedule({}, SCHEDULED_WHEN_ONLINE, currentMessageList!);
  });

  const handleSendScheduledAttachments = useLastCallback((sendCompressed: boolean, sendGrouped: boolean) => {
    requestCalendar((scheduledAt) => {
      handleMessageSchedule({ sendCompressed, sendGrouped }, scheduledAt, currentMessageList!);
    });
  });

  const handleSendSilentAttachments = useLastCallback((sendCompressed: boolean, sendGrouped: boolean) => {
    sendSilent({ sendCompressed, sendGrouped });
  });

  const onSend = mainButtonState === MainButtonState.Edit
    ? handleEditComplete
    : mainButtonState === MainButtonState.Schedule ? handleSendScheduled
      : handleSend;

  const withBotMenuButton = isChatWithBot && botMenuButton?.type === 'webApp' && !editingMessage;
  const isBotMenuButtonOpen = useDerivedState(() => {
    return withBotMenuButton && !getHtml() && !activeVoiceRecording;
  }, [withBotMenuButton, getHtml, activeVoiceRecording]);

  const withBotCommands = isChatWithBot && botMenuButton?.type === 'commands' && !editingMessage
    && botCommands !== false && !activeVoiceRecording;

  return (
    <div className={className}>
      {canAttachMedia && isReady && (
        <DropArea
          isOpen={dropAreaState !== DropAreaState.None}
          withQuick={dropAreaState === DropAreaState.QuickFile || prevDropAreaState === DropAreaState.QuickFile}
          onHide={onDropHide}
          onFileSelect={handleFileSelect}
        />
      )}
      <AttachmentModal
        chatId={chatId}
        threadId={threadId}
        canShowCustomSendMenu={canShowCustomSendMenu}
        attachments={attachments}
        getHtml={getHtml}
        isReady={isReady}
        shouldSuggestCompression={shouldSuggestCompression}
        shouldForceCompression={shouldForceCompression}
        shouldForceAsFile={shouldForceAsFile}
        isForCurrentMessageList={isForCurrentMessageList}
        shouldSchedule={shouldSchedule}
        onCaptionUpdate={onCaptionUpdate}
        onSendSilent={handleSendSilentAttachments}
        onSend={handleSendAttachments}
        onSendScheduled={handleSendScheduledAttachments}
        onFileAppend={handleAppendFiles}
        onClear={handleClearAttachments}
        onAttachmentsUpdate={handleSetAttachments}
        onCustomEmojiSelect={handleCustomEmojiSelectAttachmentModal}
        onRemoveSymbol={removeSymbolAttachmentModal}
        onEmojiSelect={insertTextAndUpdateCursorAttachmentModal}
      />
      <PollModal
        isOpen={pollModal.isOpen}
        isQuiz={pollModal.isQuiz}
        shouldBeAnonymous={isChannel}
        onClear={closePollModal}
        onSend={handlePollSend}
      />
      {renderedEditedMessage && (
        <DeleteMessageModal
          isOpen={isDeleteModalOpen}
          isSchedule={messageListType === 'scheduled'}
          onClose={closeDeleteModal}
          message={renderedEditedMessage}
        />
      )}
      <SendAsMenu
        isOpen={isSendAsMenuOpen}
        onClose={closeSendAsMenu}
        chatId={chatId}
        selectedSendAsId={sendAsId}
        sendAsPeerIds={sendAsPeerIds}
        isCurrentUserPremium={isCurrentUserPremium}
      />
      <MentionTooltip
        isOpen={isMentionTooltipOpen}
        filteredUsers={mentionFilteredUsers}
        onInsertUserName={insertMention}
        onClose={closeMentionTooltip}
      />
      <BotCommandTooltip
        isOpen={isBotCommandTooltipOpen}
        withUsername={Boolean(chatBotCommands)}
        botCommands={botTooltipCommands}
        getHtml={getHtml}
        onClick={handleBotCommandSelect}
        onClose={closeBotCommandTooltip}
      />
      <div id="message-compose">
        <div className="svg-appendix" ref={appendixRef} />

        <InlineBotTooltip
          isOpen={isInlineBotTooltipOpen}
          botId={inlineBotId}
          isGallery={isInlineBotTooltipGallery}
          inlineBotResults={inlineBotResults}
          switchPm={inlineBotSwitchPm}
          switchWebview={inlineBotSwitchWebview}
          loadMore={loadMoreForInlineBot}
          isSavedMessages={isChatWithSelf}
          canSendGifs={canSendGifs}
          isCurrentUserPremium={isCurrentUserPremium}
          onSelectResult={handleInlineBotSelect}
          onClose={closeInlineBotTooltip}
        />
        <ComposerEmbeddedMessage
          onClear={handleEmbeddedClear}
          shouldForceShowEditing={Boolean(shouldForceShowEditing && editingMessage)}
        />
        <WebPagePreview
          chatId={chatId}
          threadId={threadId}
          getHtml={getHtml}
          isDisabled={!canAttachEmbedLinks || hasAttachments}
        />
        <div className="message-input-wrapper">
          {withBotMenuButton && (
            <BotMenuButton
              isOpen={isBotMenuButtonOpen}
              text={botMenuButton.text}
              isDisabled={Boolean(activeVoiceRecording)}
              onClick={handleClickBotMenu}
            />
          )}
          {withBotCommands && (
            <ResponsiveHoverButton
              className={buildClassName('bot-commands', isBotCommandMenuOpen && 'activated')}
              round
              disabled={botCommands === undefined}
              color="translucent"
              onActivate={handleActivateBotCommandMenu}
              ariaLabel="Open bot command keyboard"
            >
              <i className="icon icon-bot-commands-filled" />
            </ResponsiveHoverButton>
          )}
          {canShowSendAs && (sendAsUser || sendAsChat) && (
            <Button
              round
              color="translucent"
              onClick={isSendAsMenuOpen ? closeSendAsMenu : handleSendAsMenuOpen}
              ariaLabel={lang('SendMessageAsTitle')}
              className={buildClassName('send-as-button', shouldAnimateSendAsButtonRef.current && 'appear-animation')}
            >
              <Avatar
                user={sendAsUser}
                chat={sendAsChat}
                size="tiny"
              />
            </Button>
          )}
          {(!isComposerBlocked || canSendGifs || canSendStickers) && (
            <SymbolMenuButton
              chatId={chatId}
              threadId={threadId}
              isMobile={isMobile}
              isReady={isReady}
              isSymbolMenuOpen={isSymbolMenuOpen}
              openSymbolMenu={openSymbolMenu}
              closeSymbolMenu={closeSymbolMenu}
              canSendStickers={canSendStickers}
              canSendGifs={canSendGifs}
              onGifSelect={handleGifSelect}
              onStickerSelect={handleStickerSelect}
              onCustomEmojiSelect={handleCustomEmojiSelect}
              onRemoveSymbol={removeSymbol}
              onEmojiSelect={insertTextAndUpdateCursor}
              closeBotCommandMenu={closeBotCommandMenu}
              closeSendAsMenu={closeSendAsMenu}
              isSymbolMenuForced={isSymbolMenuForced}
              canSendPlainText={!isComposerBlocked}
            />
          )}
          <MessageInput
            ref={inputRef}
            id="message-input-text"
            editableInputId={EDITABLE_INPUT_ID}
            chatId={chatId}
            canSendPlainText={!isComposerBlocked}
            threadId={threadId}
            isReady={isReady}
            isActive={!hasAttachments}
            getHtml={getHtml}
            placeholder={
              activeVoiceRecording && windowWidth <= SCREEN_WIDTH_TO_HIDE_PLACEHOLDER
                ? ''
                : (!isComposerBlocked
                  ? (botKeyboardPlaceholder || lang('Message'))
                  : lang('Chat.PlaceholderTextNotAllowed'))
            }
            forcedPlaceholder={inlineBotHelp}
            canAutoFocus={isReady && isForCurrentMessageList && !hasAttachments}
            noFocusInterception={hasAttachments}
            shouldSuppressFocus={isMobile && isSymbolMenuOpen}
            shouldSuppressTextFormatter={isEmojiTooltipOpen || isMentionTooltipOpen || isInlineBotTooltipOpen}
            onUpdate={setHtml}
            onSend={onSend}
            onSuppressedFocus={closeSymbolMenu}
          />
          {isInlineBotLoading && Boolean(inlineBotId) && (
            <Spinner color="gray" />
          )}
          {withScheduledButton && (
            <Button
              round
              faded
              className="scheduled-button"
              color="translucent"
              onClick={handleAllScheduledClick}
              ariaLabel="Open scheduled messages"
            >
              <i className="icon icon-schedule" />
            </Button>
          )}
          {Boolean(botKeyboardMessageId) && !activeVoiceRecording && !editingMessage && (
            <ResponsiveHoverButton
              className={isBotKeyboardOpen ? 'activated' : ''}
              round
              color="translucent"
              onActivate={openBotKeyboard}
              ariaLabel="Open bot command keyboard"
            >
              <i className="icon icon-bot-command" />
            </ResponsiveHoverButton>
          )}
          {activeVoiceRecording && Boolean(currentRecordTime) && (
            <span className="recording-state">
              {formatVoiceRecordDuration(currentRecordTime - startRecordTimeRef.current!)}
            </span>
          )}
          <AttachMenu
            chatId={chatId}
            threadId={threadId}
            isButtonVisible={!activeVoiceRecording && !editingMessage}
            canAttachMedia={canAttachMedia}
            canAttachPolls={canAttachPolls}
            canSendPhotos={canSendPhotos}
            canSendVideos={canSendVideos}
            canSendDocuments={canSendDocuments}
            canSendAudios={canSendAudios}
            onFileSelect={handleFileSelect}
            onPollCreate={openPollModal}
            isScheduled={shouldSchedule}
            attachBots={attachBots}
            peerType={attachMenuPeerType}
            theme={theme}
          />
          {Boolean(botKeyboardMessageId) && (
            <BotKeyboardMenu
              messageId={botKeyboardMessageId}
              isOpen={isBotKeyboardOpen}
              onClose={closeBotKeyboard}
            />
          )}
          {botCommands && (
            <BotCommandMenu
              isOpen={isBotCommandMenuOpen}
              botCommands={botCommands}
              onClose={closeBotCommandMenu}
            />
          )}
          <CustomEmojiTooltip
            chatId={chatId}
            isOpen={isCustomEmojiTooltipOpen}
            onCustomEmojiSelect={insertCustomEmoji}
            addRecentCustomEmoji={addRecentCustomEmoji}
            onClose={closeCustomEmojiTooltip}
          />
          <StickerTooltip
            chatId={chatId}
            threadId={threadId}
            isOpen={isStickerTooltipOpen}
            onStickerSelect={handleStickerSelect}
            onClose={closeStickerTooltip}
          />
          <EmojiTooltip
            isOpen={isEmojiTooltipOpen}
            emojis={filteredEmojis}
            customEmojis={filteredCustomEmojis}
            addRecentEmoji={addRecentEmoji}
            addRecentCustomEmoji={addRecentCustomEmoji}
            onEmojiSelect={insertEmoji}
            onCustomEmojiSelect={insertEmoji}
            onClose={closeEmojiTooltip}
          />
        </div>
      </div>
      {activeVoiceRecording && (
        <Button
          round
          color="danger"
          className="cancel"
          onClick={stopRecordingVoice}
          ariaLabel="Cancel voice recording"
        >
          <i className="icon icon-delete" />
        </Button>
      )}
      <Button
        ref={mainButtonRef}
        round
        color="secondary"
        className={buildClassName(mainButtonState, !isReady && 'not-ready', activeVoiceRecording && 'recording')}
        disabled={areVoiceMessagesNotAllowed}
        allowDisabledClick
        noFastClick
        ariaLabel={lang(sendButtonAriaLabel)}
        onClick={mainButtonHandler}
        onContextMenu={
          mainButtonState === MainButtonState.Send && canShowCustomSendMenu ? handleContextMenu : undefined
        }
      >
        <i className="icon icon-send" />
        <i className="icon icon-schedule" />
        <i className="icon icon-microphone-alt" />
        <i className="icon icon-check" />
      </Button>
      {canShowCustomSendMenu && (
        <CustomSendMenu
          isOpen={isCustomSendMenuOpen}
          canScheduleUntilOnline={canScheduleUntilOnline}
          onSendSilent={!isChatWithSelf ? handleSendSilent : undefined}
          onSendSchedule={!shouldSchedule ? handleSendScheduled : undefined}
          onSendWhenOnline={handleSendWhenOnline}
          onClose={handleContextMenuClose}
          onCloseAnimationEnd={handleContextMenuHide}
          isSavedMessages={isChatWithSelf}
        />
      )}
      {calendar}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, {
    chatId, threadId, messageListType, isMobile,
  }): StateProps => {
    const chat = selectChat(global, chatId);
    const chatBot = chatId !== REPLIES_USER_ID ? selectBot(global, chatId) : undefined;
    const isChatWithBot = Boolean(chatBot);
    const isChatWithSelf = selectIsChatWithSelf(global, chatId);
    const isChatWithUser = isUserId(chatId);
    const chatBotFullInfo = isChatWithBot ? selectUserFullInfo(global, chatBot.id) : undefined;
    const chatFullInfo = !isChatWithUser ? selectChatFullInfo(global, chatId) : undefined;
    const messageWithActualBotKeyboard = (isChatWithBot || !isChatWithUser)
      && selectNewestMessageWithBotKeyboardButtons(global, chatId, threadId);
    const scheduledIds = selectScheduledIds(global, chatId, threadId);
    const {
      language, shouldSuggestStickers, shouldSuggestCustomEmoji, shouldUpdateStickerSetOrder,
    } = global.settings.byKey;
    const baseEmojiKeywords = global.emojiKeywords[BASE_EMOJI_KEYWORD_LANG];
    const emojiKeywords = language !== BASE_EMOJI_KEYWORD_LANG ? global.emojiKeywords[language] : undefined;
    const botKeyboardMessageId = messageWithActualBotKeyboard ? messageWithActualBotKeyboard.id : undefined;
    const keyboardMessage = botKeyboardMessageId ? selectChatMessage(global, chatId, botKeyboardMessageId) : undefined;
    const { currentUserId } = global;
    const defaultSendAsId = chatFullInfo ? chatFullInfo?.sendAsId || currentUserId : undefined;
    const sendAsId = chat?.sendAsPeerIds && defaultSendAsId && (
      chat.sendAsPeerIds.some((peer) => peer.id === defaultSendAsId)
        ? defaultSendAsId
        : (chat?.adminRights?.anonymous ? chat?.id : undefined)
    );
    const sendAsUser = sendAsId ? selectUser(global, sendAsId) : undefined;
    const sendAsChat = !sendAsUser && sendAsId ? selectChat(global, sendAsId) : undefined;
    const requestedDraftText = selectRequestedDraftText(global, chatId);
    const requestedDraftFiles = selectRequestedDraftFiles(global, chatId);
    const currentMessageList = selectCurrentMessageList(global);
    const isForCurrentMessageList = chatId === currentMessageList?.chatId
      && threadId === currentMessageList?.threadId
      && messageListType === currentMessageList?.type;
    const user = selectUser(global, chatId);
    const canSendVoiceByPrivacy = (user && !selectUserFullInfo(global, user.id)?.noVoiceMessages) ?? true;
    const slowMode = chatFullInfo?.slowMode;

    const editingDraft = messageListType === 'scheduled'
      ? selectEditingScheduledDraft(global, chatId)
      : selectEditingDraft(global, chatId, threadId);

    const replyingToId = selectReplyingToId(global, chatId, threadId);

    const tabState = selectTabState(global);

    return {
      isOnActiveTab: !tabState.isBlurred,
      editingMessage: selectEditingMessage(global, chatId, threadId, messageListType),
      connectionState: global.connectionState,
      replyingToId,
      draft: selectDraft(global, chatId, threadId),
      chat,
      isChatWithBot,
      isChatWithSelf,
      isForCurrentMessageList,
      canScheduleUntilOnline: selectCanScheduleUntilOnline(global, chatId),
      isChannel: chat ? isChatChannel(chat) : undefined,
      isRightColumnShown: selectIsRightColumnShown(global, isMobile),
      isSelectModeActive: selectIsInSelectMode(global),
      withScheduledButton: (
        messageListType === 'thread'
        && Boolean(scheduledIds?.length)
      ),
      shouldSchedule: messageListType === 'scheduled',
      botKeyboardMessageId,
      botKeyboardPlaceholder: keyboardMessage?.keyboardPlaceholder,
      isForwarding: chatId === tabState.forwardMessages.toChatId,
      pollModal: tabState.pollModal,
      stickersForEmoji: global.stickers.forEmoji.stickers,
      customEmojiForEmoji: global.customEmojis.forEmoji.stickers,
      groupChatMembers: chatFullInfo?.members,
      topInlineBotIds: global.topInlineBots?.userIds,
      currentUserId,
      lastSyncTime: global.lastSyncTime,
      contentToBeScheduled: tabState.contentToBeScheduled,
      shouldSuggestStickers,
      shouldSuggestCustomEmoji,
      shouldUpdateStickerSetOrder,
      recentEmojis: global.recentEmojis,
      baseEmojiKeywords: baseEmojiKeywords?.keywords,
      emojiKeywords: emojiKeywords?.keywords,
      inlineBots: tabState.inlineBots.byUsername,
      isInlineBotLoading: tabState.inlineBots.isLoading,
      chatBotCommands: chatFullInfo?.botCommands,
      botCommands: chatBotFullInfo ? (chatBotFullInfo.botInfo?.commands || false) : undefined,
      botMenuButton: chatBotFullInfo?.botInfo?.menuButton,
      sendAsUser,
      sendAsChat,
      sendAsId,
      editingDraft,
      requestedDraftText,
      requestedDraftFiles,
      attachBots: global.attachMenu.bots,
      attachMenuPeerType: selectChatType(global, chatId),
      theme: selectTheme(global),
      fileSizeLimit: selectCurrentLimit(global, 'uploadMaxFileparts') * MAX_UPLOAD_FILEPART_SIZE,
      captionLimit: selectCurrentLimit(global, 'captionLength'),
      isCurrentUserPremium: selectIsCurrentUserPremium(global),
      canSendVoiceByPrivacy,
      attachmentSettings: global.attachmentSettings,
      slowMode,
      currentMessageList,
    };
  },
)(Composer));
