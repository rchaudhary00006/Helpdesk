import { describe, expect, it } from 'vitest';
import {
  autoReplyReason,
  cleanSubject,
  emailAddressOf,
  extractReply,
  REPLY_MARKER,
  ticketNumberFromHeaders,
  ticketNumberFromSubject,
} from './email';

describe('addresses & subjects', () => {
  it('extracts and lowercases addresses', () => {
    expect(emailAddressOf('"Carol C" <Carol@Acme.test>')).toBe('carol@acme.test');
    expect(emailAddressOf(' dave@acme.test ')).toBe('dave@acme.test');
  });
  it('finds ticket numbers in headers and subjects', () => {
    expect(ticketNumberFromHeaders([undefined, '<abc@x> <ticket-42.k3j@helpdesk.local>'])).toBe(42);
    expect(ticketNumberFromHeaders(['<ticket-7@helpdesk.local>'])).toBe(7);
    expect(ticketNumberFromHeaders(['<CAF123@mail.gmail.com>'])).toBeNull();
    expect(ticketNumberFromSubject('Re: [#1042] New reply on your request')).toBe(1042);
    expect(ticketNumberFromSubject('Order #1042 is late')).toBeNull();
  });
  it('cleans reply/forward prefixes and ticket tokens', () => {
    expect(cleanSubject('RE: Fwd: [#12] Printer on fire')).toBe('Printer on fire');
    expect(cleanSubject('AW: Re[2]: VPN down')).toBe('VPN down');
    expect(cleanSubject(undefined)).toBe('');
  });
});

describe('extractReply', () => {
  it('cuts at the reply marker', () => {
    const body = `Thanks, that fixed it!\n\n> ${REPLY_MARKER}\n> Hi Carol, ...`;
    expect(extractReply(body)).toBe('Thanks, that fixed it!');
  });

  it('strips Gmail quoted history, including a wrapped "wrote:" line', () => {
    const body = [
      'Still broken on my side.',
      '',
      'On Mon, 6 Oct 2026 at 13:15, Helpdesk <',
      'support@helpdesk.local> wrote:',
      '> Can you retry?',
    ].join('\n');
    expect(extractReply(body)).toBe('Still broken on my side.');
  });

  it('strips Outlook headers', () => {
    const body = 'Works now.\r\n\r\nFrom: Helpdesk <support@x.com>\r\nSent: Monday\r\nTo: me\r\nSubject: hi\r\n\r\nold';
    expect(extractReply(body)).toBe('Works now.');
    expect(extractReply('Ok\n\n-----Original Message-----\nblah')).toBe('Ok');
  });

  it('strips signatures and mobile footers', () => {
    expect(extractReply('Yes please close it.\n\n-- \nCarol\nAcme Corp')).toBe('Yes please close it.');
    expect(extractReply('On it\n\nSent from my iPhone')).toBe('On it');
  });

  it('keeps ordinary text that merely starts with "On"', () => {
    expect(extractReply('On second thought, please keep it open.')).toBe('On second thought, please keep it open.');
  });

  it('returns empty when the reply is only quoted text', () => {
    expect(extractReply('> quoted\n> more')).toBe('');
  });
});

describe('autoReplyReason', () => {
  it('flags auto-submitted, bulk and list mail', () => {
    expect(autoReplyReason({ 'auto-submitted': 'auto-replied' })).toMatch(/auto-submitted/);
    expect(autoReplyReason({ precedence: 'bulk' })).toMatch(/precedence/);
    expect(autoReplyReason({ 'x-autoreply': 'yes' })).toBeTruthy();
    expect(autoReplyReason({ 'list-id': '<news.acme.test>' })).toBe('mailing list');
  });
  it('lets normal mail through', () => {
    expect(autoReplyReason({ 'auto-submitted': 'no' })).toBeNull();
    expect(autoReplyReason({})).toBeNull();
  });
});
