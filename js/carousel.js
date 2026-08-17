// Простая карусель товаров без сторонних библиотек (без owl.carousel).
// Работает через нативный горизонтальный скролл + scroll-snap,
// добавляет кнопки "вперёд/назад" и точки-пагинацию.
(function () {
  "use strict";

  function initCarousel(root) {
    var viewport = root.querySelector("[data-carousel-viewport]");
    var track = root.querySelector("[data-carousel-track]");
    var prevBtn = root.querySelector("[data-carousel-prev]");
    var nextBtn = root.querySelector("[data-carousel-next]");
    var dotsWrap = root.querySelector("[data-carousel-dots]");
    if (!viewport || !track) return;

    var items = Array.prototype.slice.call(track.children);
    if (!items.length) return;

    var dots = [];

    function step() {
      // Ширина одной карточки + отступ между карточками — на столько скроллим за клик.
      var gap = parseFloat(getComputedStyle(track).gap) || 20;
      return items[0].getBoundingClientRect().width + gap;
    }

    function perView() {
      return Math.max(1, Math.round(viewport.clientWidth / step()));
    }

    function pageCount() {
      return Math.max(1, Math.ceil(items.length / perView()));
    }

    function currentPage() {
      var p = Math.round(viewport.scrollLeft / (step() * perView()));
      return Math.min(Math.max(p, 0), pageCount() - 1);
    }

    function buildDots() {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = "";
      dots = [];
      var count = pageCount();
      if (count <= 1) return;
      for (var i = 0; i < count; i += 1) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "carousel__dot";
        dot.setAttribute("aria-label", "Показать группу товаров " + (i + 1));
        (function (index) {
          dot.addEventListener("click", function () {
            viewport.scrollTo({
              left: index * perView() * step(),
              behavior: "smooth",
            });
          });
        })(i);
        dotsWrap.appendChild(dot);
        dots.push(dot);
      }
      updateUI();
    }

    function updateUI() {
      var maxScroll = track.scrollWidth - viewport.clientWidth - 1;
      if (prevBtn) prevBtn.disabled = viewport.scrollLeft <= 0;
      if (nextBtn) nextBtn.disabled = viewport.scrollLeft >= maxScroll;

      if (dots.length) {
        var page = currentPage();
        dots.forEach(function (dot, index) {
          dot.classList.toggle("is-active", index === page);
        });
      }
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        viewport.scrollBy({ left: -step() * perView(), behavior: "smooth" });
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        viewport.scrollBy({ left: step() * perView(), behavior: "smooth" });
      });
    }

    var scrollRaf = null;
    viewport.addEventListener("scroll", function () {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(function () {
        updateUI();
        scrollRaf = null;
      });
    });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        buildDots();
      }, 150);
    });

    buildDots();
  }

  function init() {
    var carousels = document.querySelectorAll("[data-carousel]");
    carousels.forEach(initCarousel);
  }

  // Доступно для повторного вызова после того, как main.js перерисует
  // содержимое #app (SPA-навигация), чтобы карусель заработала и на
  // динамически отрисованной версии страницы.
  window.RCCarousel = { init: init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
