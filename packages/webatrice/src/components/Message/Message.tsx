import { NavLink, generatePath } from 'react-router-dom';
import { Fragment, useMemo, type ReactNode } from 'react';

import { CALLOUT_BOUNDARY_REGEX, CARD_CALLOUT_REGEX, MENTION_REGEX, RouteEnum, URL_REGEX } from '@app/types';
import { parseMention, segmentText, type ChatHighlight } from '@app/utils';
import UserActionsMenu from '../UserDisplay/UserActionsMenu';
import { useUserDisplay } from '../UserDisplay/useUserDisplay';
import { containsGameLink } from '@app/utils';
import { renderGameLinks } from '../GameLink/GameLinkButton';
import CardCallout from './CardCallout';
import { useParsedMessage } from './useMessage';
import './Message.css';

interface MessagePayload {
  message: string;
}

/** Pass a memoized object: it keys the parse memo. */
export type MessageHighlight = ChatHighlight;

interface MessageProps {
  message: MessagePayload;
  // Server time of a chat-history line, shown in brackets after the sender as
  // desktop's TabRoom::processRoomSayEvent prefixes it to the message text.
  timestamp?: string;
  highlight?: MessageHighlight;
}

const Message = ({ message: { message }, timestamp, highlight }: MessageProps) => (
  <div className='message'>
    <div className='message__detail'>
      <ParsedMessage message={message} timestamp={timestamp} highlight={highlight} />
    </div>
  </div>
);

interface ParsedMessageProps {
  message: string;
  timestamp?: string;
  highlight?: MessageHighlight;
}

const ParsedMessage = ({ message, timestamp, highlight }: ParsedMessageProps) => {
  const parseChunk = useMemo(() => (highlight ? makeChunkParser(highlight) : parseChunks), [highlight]);
  const { name, chunks } = useParsedMessage(message, parseChunk);

  return (
    <div>
      {name && (<strong><PlayerLink name={name} />:</strong>)}
      {timestamp && (<time className='message__timestamp'>[{timestamp}] </time>)}
      {chunks}
    </div>
  );
};

interface PlayerLinkProps {
  name: string;
  label?: string;
}

/**
 * Author name / @mention link inside a chat message. Left-click still
 * navigates to the Player page (which hosts the private-chat panel);
 * right-click (or Shift+F10 / the Menu key) opens the same UserActionsMenu
 * the Buddies / Players Online rows use, so the "Private chat" entry point is consistent
 * across the app. Cockatrice-parity: right-click on a name anywhere
 * in the desktop client also brings up this menu.
 */
const PlayerLink = ({ name, label = name }: PlayerLinkProps) => {
  const {
    menu,
    isABuddy,
    isIgnored,
    onAddBuddy,
    onRemoveBuddy,
    onAddIgnore,
    onRemoveIgnore,
  } = useUserDisplay(name);
  return (
    <>
      <NavLink
        className="link"
        to={generatePath(RouteEnum.PLAYER, { name })}
        {...menu.getTriggerProps()}
      >
        {label}
      </NavLink>
      {menu.anchor && (
        <UserActionsMenu
          anchor={menu.anchor}
          triggerRef={menu.triggerRef}
          onClose={menu.close}
          name={name}
          isABuddy={isABuddy}
          isIgnored={isIgnored}
          onAddBuddy={onAddBuddy}
          onRemoveBuddy={onRemoveBuddy}
          onAddIgnore={onAddIgnore}
          onRemoveIgnore={onRemoveIgnore}
        />
      )}
    </>
  );
};

const parseChunks = (chunk: string, index: number): ReactNode => parseChunk(chunk, index);

/** A chunk parser that also draws the reader's mentions and alert words (desktop ChatView). */
function makeChunkParser(highlight: MessageHighlight) {
  return (chunk: string, index: number): ReactNode => parseChunk(chunk, index, highlight);
}

function parseChunk(chunk: string, index: number, highlight?: MessageHighlight): ReactNode {
  if (chunk.match(CARD_CALLOUT_REGEX)) {
    const name = chunk.replace(CALLOUT_BOUNDARY_REGEX, '').trim();
    return (<CardCallout name={name} key={index}></CardCallout>);
  }

  // Desktop renders cockatrice://joingame words as join anchors (ChatView::appendGameLinkTag).
  if (containsGameLink(chunk)) {
    return <span key={index}>{renderGameLinks(chunk)}</span>;
  }

  if (chunk.match(URL_REGEX)) {
    return parseUrlChunk(chunk, highlight);
  }

  if (chunk.match(MENTION_REGEX) && highlight?.mentions !== false) {
    return parseMentionChunk(chunk, highlight);
  }

  return parseText(chunk, highlight);
}

function parseUrlChunk(chunk: string, highlight?: MessageHighlight): ReactNode {
  return chunk.split(URL_REGEX)
    .filter((urlChunk) => !!urlChunk)
    .map((urlChunk, index) => {
      if (urlChunk.match(URL_REGEX)) {
        return (<a className='link' href={urlChunk} key={index} target='_blank' rel='noopener noreferrer'>{urlChunk}</a>);
      }

      return <Fragment key={index}>{parseText(urlChunk, highlight)}</Fragment>;
    });
}

function parseMentionChunk(chunk: string, highlight?: MessageHighlight): ReactNode {
  return chunk.split(MENTION_REGEX)
    .filter((mentionChunk) => !!mentionChunk)
    .map((mentionChunk, index) => {
      const mention = mentionChunk.match(MENTION_REGEX);

      if (mention) {
        const { name, rest, own } = parseMention(mention[0].slice(1), highlight?.selfName ?? null);
        const label = `@${name}`;
        return (
          <Fragment key={index}>
            {highlight && own
              ? <mark className='message__mention' style={highlight.mentionStyle}>{label}</mark>
              : <PlayerLink name={name} label={label} />}
            {rest && parseText(rest, highlight)}
          </Fragment>
        );
      }

      return <Fragment key={index}>{parseText(mentionChunk, highlight)}</Fragment>;
    });
}

function parseText(text: string, highlight?: MessageHighlight): ReactNode {
  if (!highlight) {
    return text;
  }
  const segments = segmentText(text, {
    highlightWords: highlight.highlightWords,
    allMention: highlight.mentions && highlight.senderIsModerator,
  });
  if (segments.length === 1 && segments[0].kind === 'plain') {
    return text;
  }
  return segments.map((segment, index) => {
    switch (segment.kind) {
      case 'word':
        return (<mark className='message__highlight' style={highlight.highlightStyle} key={index}>{segment.text}</mark>);
      case 'allMention':
        return (<mark className='message__mention' style={highlight.mentionStyle} key={index}>{segment.text}</mark>);
      default:
        return segment.text;
    }
  });
}

export default Message;
