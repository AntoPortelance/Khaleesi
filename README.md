# Khaleesi

**A customizable web interface for rocket engine test-stand control, monitoring, and data recording.**

Khaleesi is a Software Engineering for Robotics team project. It aims to separate sensor data acquisition from the user interface so that display updates do not slow down measurement collection. The system is designed around a Python server, a browser-based interface, and configurable sensors and actuators.

## Project status

A first version is under development. It provides sign-in, the three main tabs, P&ID loading, actuator placement, and actuator commands shared live between all connected screens.

In this version:

- A command is applied as soon as the server receives a valid order: the state is written to `data/devices.json` and sent to every screen. **The displayed state is the commanded state.** No hardware is driven and no feedback is measured yet.
- Sensors can be created and placed on the P&ID, but acquisition exists only as method signatures in `khaleesi/acquisition.py`, so sensors have no values and the Visualization and Recorded Data tabs have no data to show.
- Network access is limited to the Raspberry Pi's own Wi-Fi network. Internet access and multi-factor authentication are planned for later.

The other features and technical choices below describe the intended system; they are not a list of verified, implemented capabilities.

The initial working version is scheduled for demonstration on **December 2, 2026**.

## Objectives

- Monitor and control a rocket engine test stand through a web browser.
- Keep data acquisition separate from display updates.
- Adapt the interface to different test stands and their sensors and actuators.
- Record measurements and test information for later review.
- Develop and validate core functions with simulated hardware before integrating physical equipment.

## Planned features

### Control

- Add, remove, and position valves and cylinders on the test-stand layout.
- Send actuator commands and verify the resulting measured state.
- Load or replace the test stand's piping and instrumentation diagram (P&ID), then place components on it.

### Visualization

- Display analog and digital sensor values in real time.
- Show live measurement graphs and the current test-stand state.
- Provide a dedicated visualization tab alongside the control interface.

### Recorded data

- Store measurements and associated test information.
- Review previously recorded tests in a dedicated tab.

### Access and simulation

- Provide authenticated access with appropriate user permissions.
- Simulate sensors and actuators for development and testing without a complete test stand.

## Planned technical approach

| Component | Planned technology or responsibility |
| --- | --- |
| Web interface | HTML, CSS, and JavaScript, without a build step |
| Server | Python and FastAPI; API, authentication, and test logic |
| Client–server communication | HTTPS and WebSocket |
| Data storage | JSON file for sensors and actuators; SQLite for user accounts |
| Hardware interface | Sensor acquisition and actuator control |
| Prototype hardware | Raspberry Pi 5, LEDs, resistors, and an optional sensor |
| Development tools | Visual Studio Code, Git, and GitHub |

The server will coordinate browser clients, data storage, and hardware communication. Acquisition and display will be handled separately to support responsive monitoring while measurements are collected.

## Scope and limitations

The initial version prioritizes valve control, live sensor values, data recording, and simulation. Integration with a real test stand will be limited during the course project.

The following are outside the initial scope:

- Sampling rates above 100 Hz.
- Custom main application tabs.
- Advanced graph customization.
- Automated data analysis.
- Detection of personnel near the test stand.

**Khaleesi is not a safety system.** Real test-stand operation requires independent safety measures, including an emergency stop. Simulation testing alone does not establish suitability for operating a real rocket engine test stand.

## Getting started

To run the application on a development computer, with Python 3.11 or newer:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m khaleesi.create_user alice
KHALEESI_COOKIE_SECURE=false python -m khaleesi
```

Then open <http://127.0.0.1:8000> and sign in. Data is stored in `data/`. Disabling secure cookies is only for local development without HTTPS.

Run the tests with `python -m pytest tests`. To install on the Raspberry Pi 5, follow [deploy/README.md](deploy/README.md).

The planned development sequence is:

1. Build the web interface and its main tabs.
2. Connect simulated sensors and actuators.
3. Implement command verification and measurement recording.
4. Test normal operation and failure scenarios in simulation.
5. Integrate and validate supported physical hardware.

## Validation plan

Each main function will first be tested with simulated hardware, followed by physical hardware where available. Planned checks include actuator state feedback, live sensor display, recorded-test retrieval, invalid measurements, and sensor or connection loss.

Code reviews and shared testing will support integration across the interface, server, visualization, and database components.

## Team

| Area | Team members | Responsibilities |
| --- | --- | --- |
| Front end | Annaelle, Alya | Web interface, navigation, P&ID layout editor, and main tabs |
| Back end | Antoine, Konstantinos | Python server, hardware communication, command verification, and authentication |
| Data visualization | Louis | Live graphs, test-stand state display, and recorded-test visualization |
| Database | Constant | Database schema, measurements, test information, and data logging |

Testing, code reviews, and version control are shared responsibilities.

## Course context

- **Course:** Software Engineering for Robotics
- **Semester:** Fall 2026
- **Instructor:** Prof. Essaid Meryam
- **Project period:** September 28 – December 2, 2026


## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch workflow, commit conventions, code standards, and local checks. Repository administrators can follow the [GitHub setup checklist](.github/REPOSITORY_SETUP.md) to activate review and merge protections.
