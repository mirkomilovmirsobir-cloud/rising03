// Простая карусель товаров без сторонних библиотек (без owl.carousel).
// Работает через нативный горизонтальный скролл + scroll-snap,
// добавляет кнопки "вперёд/назад" и точки-пагинацию.
(function () {
  "use strict";

  var AUTOPLAY_DELAY = 4000;

  function initCarousel(root) {
    var viewport = root.querySelector("[data-carousel-viewport]");
    var track = root.querySelector("[data-carousel-track]");
    var dotsWrap = root.querySelector("[data-carousel-dots]");
    if (!viewport || !track) return;

    var items = Array.prototype.slice.call(track.children);
    if (!items.length) return;

    var dots = [];
    var autoplayTimer = null;

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
      if (dots.length) {
        var page = currentPage();
        dots.forEach(function (dot, index) {
          dot.classList.toggle("is-active", index === page);
        });
      }
    }

    // Карусель прокручивается по-настоящему (в один слайд) только на
    // телефонной раскладке — на десктопе/планшете это статичная сетка.
    function isScrollable() {
      var style = getComputedStyle(viewport);
      return style.overflowX === "auto" || style.overflowX === "scroll";
    }

    function goToNext() {
      var maxScroll = track.scrollWidth - viewport.clientWidth - 1;
      if (viewport.scrollLeft >= maxScroll) {
        viewport.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        viewport.scrollBy({ left: step() * perView(), behavior: "smooth" });
      }
    }

    function stopAutoplay() {
      if (autoplayTimer) {
        clearInterval(autoplayTimer);
        autoplayTimer = null;
      }
    }

    function startAutoplay() {
      stopAutoplay();
      if (!isScrollable() || pageCount() <= 1) return;
      autoplayTimer = setInterval(goToNext, AUTOPLAY_DELAY);
    }

    viewport.addEventListener("mouseenter", stopAutoplay);
    viewport.addEventListener("mouseleave", startAutoplay);
    viewport.addEventListener("touchstart", stopAutoplay, { passive: true });
    viewport.addEventListener("touchend", function () {
      setTimeout(startAutoplay, 2500);
    });

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
        startAutoplay();
      }, 150);
    });

    buildDots();
    startAutoplay();
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
