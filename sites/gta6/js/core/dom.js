'use strict';
var G6 = window.G6 || {};

G6.dom = (function () {

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function $$(sel, ctx) {
    return Array.from((ctx || document).querySelectorAll(sel));
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') {
          node.className = attrs[k];
        } else if (k === 'textContent') {
          node.textContent = attrs[k];
        } else if (k === 'style' && typeof attrs[k] === 'object') {
          Object.assign(node.style, attrs[k]);
        } else if (k.startsWith('data-')) {
          node.setAttribute(k, attrs[k]);
        } else if (k === 'htmlFor') {
          node.htmlFor = attrs[k];
        } else {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function on(target, event, fn, opts) {
    target.addEventListener(event, fn, opts || false);
    return function () { target.removeEventListener(event, fn, opts || false); };
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function focusTrap(container) {
    var focusable = 'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])';
    function handler(e) {
      if (e.key !== 'Tab') return;
      var els = Array.from(container.querySelectorAll(focusable)).filter(function (el) {
        return !el.closest('[hidden]') && !el.closest('[inert]');
      });
      if (!els.length) { e.preventDefault(); return; }
      var first = els[0];
      var last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    container.addEventListener('keydown', handler);
    return function () { container.removeEventListener('keydown', handler); };
  }

  var _toastHost = null;

  function getToastHost() {
    if (!_toastHost) {
      _toastHost = document.getElementById('toastHost');
      if (!_toastHost) {
        _toastHost = document.createElement('div');
        _toastHost.id = 'toastHost';
        _toastHost.className = 'toast-host';
        document.body.appendChild(_toastHost);
      }
    }
    return _toastHost;
  }

  function toast(msg, type, duration) {
    var host = getToastHost();
    var node = document.createElement('div');
    node.className = 'toast' + (type ? ' ' + type : '');
    node.textContent = msg;
    host.appendChild(node);
    setTimeout(function () {
      node.style.opacity = '0';
      node.style.transition = 'opacity .3s';
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 320);
    }, duration || 2800);
  }

  window.G6 = G6;
  return { $, $$, el, on, debounce, focusTrap, toast };

})();

window.G6 = G6;
