import re

# Read the file
with open(r'c:\Users\rvham\rent_soft\public\rental-order-form.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Define the new section HTML
new_section = '''              <div data-rental-info-field="notificationCircumstances">
                <label>Notification circumstance</label>
                <div id="notification-circumstances-container" style="display:flex; flex-wrap:wrap; gap:16px; align-items:center;">
                   <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                      <input type="checkbox" value="Damage"> Damage
                   </label>
                   <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                      <input type="checkbox" value="Trespassing"> Trespassing
                   </label>
                   <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                      <input type="checkbox" value="Suspicious activity"> Suspicious activity
                   </label>
                   <div style="display:flex; align-items:center; gap:6px;">
                       <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                          <input type="checkbox" value="Other" id="notification-circumstance-other-cb"> Other
                       </label>
                       <input id="notification-circumstance-other-input" type="text" placeholder="Please specify..." style="display:none; margin-left:8px; padding:4px 8px; border:1px solid #ccc; border-radius:4px;" />
                   </div>
                </div>
              </div>
'''

# Find the insertion point (before coverage-block)
pattern = r'(              </div>\r?\n)(              <div class="coverage-block" data-rental-info-field="coverageHours">)'
replacement = r'\1' + new_section + r'\2'

# Perform the replacement
new_content = re.sub(pattern, replacement, content)

# Write back
with open(r'c:\Users\rvham\rent_soft\public\rental-order-form.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully added notification circumstances section to rental-order-form.html")
