// Add this helper function and event handler to rental-order-form.js

// Helper function to collect notification circumstances
function collectNotificationCircumstances() {
    if (!notificationCircumstancesContainer) return [];
    const checkboxes = notificationCircumstancesContainer.querySelectorAll('input[type="checkbox"]:checked');
    const values = [];
    checkboxes.forEach((cb) => {
        if (cb.value === "Other") {
            const otherVal = (notificationOtherInput?.value || "").trim();
            if (otherVal) {
                values.push(`Other: ${otherVal}`);
            } else {
                values.push("Other");
            }
        } else {
            values.push(cb.value);
        }
    });
    return values;
}

// Event handler for "Other" checkbox toggle
if (notificationOtherCheckbox && notificationOtherInput) {
    notificationOtherCheckbox.addEventListener("change", () => {
        if (notificationOtherCheckbox.checked) {
            notificationOtherInput.style.display = "";
            notificationOtherInput.focus();
        } else {
            notificationOtherInput.style.display = "none";
        }
        scheduleDraftSave();
    });

    notificationOtherInput.addEventListener("input", () => {
        scheduleDraftSave();
    });
}

// Add change listeners to all notification checkboxes
if (notificationCircumstancesContainer) {
    const checkboxes = notificationCircumstancesContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
        if (cb !== notificationOtherCheckbox) {
            cb.addEventListener("change", () => {
                scheduleDraftSave();
            });
        }
    });
}
