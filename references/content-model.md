# The Content Model — what nests in what

Digested from MDN `web/html/guides/content_categories`. Content categories
define each element's *content model*: which elements are valid descendants.
Getting this right is what keeps the DOM valid and the accessibility tree clean.

## Metadata content

Elements belonging to the _metadata content_ category modify the presentation or the behavior of the rest of the document, set up links to other documents, or convey other _out-of-band_ information. Everything in the `<head>`, including the `<title>`, `<link>`, `<script>`, `<style>`, and the lesser used `<base>`, is metadata content. There is a `<meta>` element for metadata that cannot be represented by these other elements.

*Members:* `<base>`, `<link>`, `<meta>`, `<noscript>`, `<script>`, `<style>`, `<template>`, `<title>`

## Flow content

Flow content is a broad category that encompasses most elements that can go inside the <body> element, including heading elements, sectioning elements, phrasing elements, embedding elements, interactive elements, and form-related elements. It also includes text nodes (but not those that only consist of white space characters).

*Members:* `<a>`, `<abbr>`, `<address>`, `<article>`, `<aside>`, `<audio>`, `<b>`, `<bdi>`, `<bdo>`, `<blockquote>`, `<br>`, `<button>`, `<canvas>`, `<cite>`, `<code>`, `<data>`, `<datalist>`, `<del>`, `<details>`, `<dfn>`, `<dialog>`, `<div>`, `<dl>`, `<em>`, `<embed>`, `<fieldset>`, `<figure>`, `<footer>`, `<form>`, `<geolocation>`, `<h1>`–`<h6>`, `<header>`, `<hgroup>`, `<hr>`, `<i>`, `<iframe>`, `<img>`, `<input>`, `<ins>`, `<kbd>`, `<label>`, `<main>`, `<map>`, `<mark>`, `<menu>`, `<meter>`, `<nav>`, `<noscript>`, `<object>`, `<ol>`, `<output>`, `<p>`, `<picture>`, `<pre>`, `<progress>`, `<q>`, `<ruby>`, `<s>`, `<samp>`, `<script>`, `<search>`, `<section>`, `<select>`, `<slot>`, `<small>`, `<span>`, `<strong>`, `<sub>`, `<sup>`, `<table>`, `<template>`, `<textarea>`, `<time>`, `<u>`, `<ul>`, `<var>`, `<video>`, `<wbr>`, `<area>`, `<link>`, `<meta>`

## Sectioning content

Sectioning content, a subset of flow content, creates a section in the current outline defining the scope of `<header>` and `<footer>` elements.

*Members:* `<article>`, `<aside>`, `<nav>`, `<section>`

## Heading content

Heading content, a subset of flow content, defines the title of a section. This definition applies both to sections marked by an explicit sectioning content elements and to those implicitly defined by the heading content itself.

*Members:* `<h1>`–`<h6>`, `<hgroup>`

## Phrasing content

Phrasing content, a subset of flow content, refers to the text and the markup within a document. Sequences of phrasing content make up paragraphs.

*Members:* `<abbr>`, `<audio>`, `<b>`, `<bdi>`, `<bdo>`, `<br>`, `<button>`, `<canvas>`, `<cite>`, `<code>`, `<data>`, `<datalist>`, `<dfn>`, `<em>`, `<embed>`, `<i>`, `<iframe>`, `<img>`, `<input>`, `<kbd>`, `<label>`, `<mark>`, `<meter>`, `<noscript>`, `<object>`, `<output>`, `<picture>`, `<progress>`, `<q>`, `<ruby>`, `<s>`, `<samp>`, `<script>`, `<select>`, `<slot>`, `<small>`, `<span>`, `<strong>`, `<sub>`, `<sup>`, `<template>`, `<textarea>`, `<time>`, `<u>`, `<var>`, `<video>`, `<wbr>`, `<a>`, `<area>`, `<map>`, `<del>`, `<ins>`, `<link>`, `<meta>`

## Embedded content

Embedded content, a subset of flow content, imports another resource or inserts content from another markup language or namespace into the document.

*Members:* `<audio>`, `<canvas>`, `<embed>`, `<iframe>`, `<img>`, `<object>`, `<picture>`, `<video>`

## Interactive content

Interactive content, a subset of flow content, includes elements that are specifically designed for user interaction.

*Members:* `<button>`, `<details>`, `<embed>`, `<iframe>`, `<label>`, `<select>`, `<textarea>`, `<a>`, `<audio>`, `<img>`, `<input>`, `<object>`, `<video>`

## Palpable content

**Palpable content** is content that is neither empty nor hidden; it is content that is rendered and substantive. Palpable content is not used to define content models but is used to define a general rule: Elements whose content model allows any flow content or phrasing content should have at least one node in its contents that is palpable content and that does not have the `hidden` attribute specified.

*Members:* `<a>`, `<abbr>`, `<address>`, `<article>`, `<aside>`, `<b>`, `<bdi>`, `<bdo>`, `<blockquote>`, `<button>`, `<canvas>`, `<cite>`, `<code>`, `<data>`, `<del>`, `<details>`, `<dfn>`, `<div>`, `<em>`, `<embed>`, `<fieldset>`, `<footer>`, `<figure>`, `<form>`, `<iframe>`, `<img>`, `<ins>`, `<kbd>`, `<label>`, `<main>`, `<map>`, `<mark>`, `<meter>`, `<nav>`, `<object>`, `<p>`, `<picture>`, `<pre>`, `<progress>`, `<q>`, `<ruby>`, `<s>`, `<samp>`, `<search>`, `<section>`, `<select>`, `<small>`, `<span>`, `<strong>`, `<sub>`, `<sup>`, `<table>`, `<textarea>`, `<time>`, `<u>`, `<var>`, `<video>`, `<audio>`, `<dl>`, `<input>`, `<ol>`, `<li>`, `<ul>`

## Elements without a category

Several elements are not a member of _any_ content category. These include:

*Members:* `<caption>`, `<col>`, `<colgroup>`, `<dd>`, `<dt>`, `<figcaption>`, `<head>`, `<html>`, `<legend>`, `<li>`, `<optgroup>`, `<option>`, `<param>`, `<rb>`, `<rp>`, `<rt>`, `<rtc>`, `<source>`, `<tbody>`, `<tfoot>`, `<th>`, `<thead>`, `<tr>`, `<track>`

## Script-supporting elements

**Script-supporting elements** are elements that don't directly contribute to a document's rendered output. Instead, they serve to support scripts, either by containing or specifying script code directly or by specifying data that will be used by scripts. Nearly all elements, including those that only take specific elements (such as `<ul>`, which takes `<li>` elements), can contain script-supporting elements.

*Members:* `<script>`, `<template>`

## Form-associated content

Form-associated content is a subset of flow content comprising elements that have a form owner and can be used everywhere flow content is expected. A form owner is either the containing `<form>` element or the `<form>` whose `id` is specified in the element's `form` attribute.

*Members:* `<button>`, `<fieldset>`, `<input>`, `<object>`, `<output>`, `<select>`, `<textarea>`, `<img>`, `<label>`, `<meter>`, `<progress>`

## Transparent content model

In addition to the listed content categories, an element's content model may also be defined as "transparent". If an element X's permitted content is "transparent", then we look at the parent of X. We intersect the permitted content of X's parent with the content categories of X, and the result is what "transparent" means in this context. If the parent of X also has a transparent content model, then we continue up the tree until we find a non-transparent content model. When there's no such parent, "transparent" means "flow content".
