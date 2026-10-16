'use strict';

document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
});

const scoreForm = document.querySelector('[data-score-form]');
if (scoreForm) {
  const output = scoreForm.querySelector('[data-score-output]');
  const scoreNames = ['attendance_score', 'midterm_score', 'final_score'];
  const weights = [1, 3, 6];
  const updatePreview = () => {
    const inputs = scoreNames.map((name) => scoreForm.elements.namedItem(name));
    const valid = inputs.every((input) => input.value.trim() !== '' && input.validity.valid);
    const weightedHundredths = inputs.reduce((total, input, index) =>
      total + Math.round(Number(input.value) * 100) * weights[index], 0);
    const total = Math.floor((weightedHundredths + 5) / 10) / 100;
    output.textContent = valid
      ? total.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '—';
  };
  scoreForm.querySelectorAll('[data-score-input]').forEach((input) => {
    input.addEventListener('input', updatePreview);
  });
  updatePreview();
}
