/* RainLoop Webmail (c) RainLoop Team | Licensed under MIT */
/* Small adapters for the UI contracts used by the application. */
(function ($) {
 'use strict';
 const popovers = new WeakMap();
 $.fn.dropdown = function () {
  return this.each(function () {
   const parent = this.parentElement;
   const opened = parent.classList.contains('open');
   document.querySelectorAll('.dropdown.open, .btn-group.open').forEach((item) => item.classList.remove('open'));
   parent.classList.toggle('open', !opened);
   this.setAttribute('aria-expanded', String(!opened));
  });
 };
 $.fn.modal = function (option) {
  return this.each(function () {
   const show = typeof option === 'string' ? option === 'show' : !!option.show;
   if ($(this).hasClass('in') === show) return;
   $(this).trigger(show ? 'show' : 'hide');
   $(this).toggleClass('in', show).css('display', show ? 'block' : 'none').attr('aria-hidden', String(!show));
   $(this).trigger(show ? 'shown' : 'hidden');
   if (show) { this.setAttribute('tabindex', '-1'); this.focus(); }
  });
 };
 $.fn.tab = function () {
  return this.each(function () {
   const selector = this.getAttribute('href');
   if (!selector || !/^#[A-Za-z][\w-]*$/.test(selector)) return;
   const target = document.getElementById(selector.slice(1));
   if (!target) return;
   $(this).closest('ul').find('.active').removeClass('active');
   $(this).parent().addClass('active');
   $(target).siblings().removeClass('active');
   $(target).addClass('active');
   $(this).trigger('shown');
  });
 };
 $.fn.popover = function (option) {
  return this.each(function () {
   const button = this;
   const old = popovers.get(button);
   if (old) { old.remove(); $(button).off('.rainloopPopover'); popovers.delete(button); }
   if (option === 'destroy') return;
   const config = option || {};
   const content = typeof config.content === 'function' ? config.content.call(button) : config.content;
   const popover = document.createElement('div');
   popover.className = 'popover top';
   popover.setAttribute('role', 'tooltip');
   // Popover values are always rendered as text, including names and addresses.
   const title = document.createElement('h3'); title.className = 'popover-title'; title.textContent = config.title || '';
   const body = document.createElement('div'); body.className = 'popover-content'; body.textContent = content || '';
   popover.append(title, body);
   popovers.set(button, popover);
   const show = () => {
    document.body.appendChild(popover);
    const rect = button.getBoundingClientRect();
    Object.assign(popover.style, { display: 'block', position: 'absolute', top: (rect.top + window.scrollY - popover.offsetHeight) + 'px', left: (rect.left + window.scrollX) + 'px' });
   };
   const hide = () => popover.remove();
   $(button).on('mouseenter.rainloopPopover focus.rainloopPopover', show).on('mouseleave.rainloopPopover blur.rainloopPopover', hide);
  });
 };
 $(document).on('click.rainloopDropdownToggle', '[data-toggle="dropdown"]', function(event) {
  event.preventDefault(); event.stopPropagation(); $(this).dropdown('toggle');
 });
 $(document).on('click.rainloopDropdown', (event) => {
  if (!event.target.closest('.dropdown, .btn-group')) document.querySelectorAll('.open').forEach((item) => {
   if (item.classList.contains('dropdown') || item.classList.contains('btn-group')) item.classList.remove('open');
  });
 });
})(window.jQuery);
