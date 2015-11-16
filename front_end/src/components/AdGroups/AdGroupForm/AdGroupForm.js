import React, { Component, PropTypes } from 'react';
import { Link } from 'react-router';

import { displayMessage, shownMessage, formChanged, formSaved } from 'actions/App/AppActions';
import { createAdGroup, updateAdGroup, fetchAdGroups, adGroupSetDetailsVar } from 'actions/AdGroups/AdGroupActions';
import { bindFormValidators, bindFormConfig } from 'helpers/FormValidators';

window.$ = require('jquery');
window.jQuery = $;
require('select2');
require('select2/dist/css/select2.min.css');
require('jquery-serializejson');

bindFormConfig();
require('parsleyjs');

export default class AdGroupForm extends Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.handleFormSubmit = this.handleFormSubmit.bind(this);
    this.handleSwitch = this.handleSwitch.bind(this);
  }

  componentWillMount(){
    if(this.props.AdGroup.details.type === undefined){
      this.props.dispatch(adGroupSetDetailsVar('type', 'suggested'));
    }
  }
  componentDidMount(){
    const context = this;
    bindFormValidators();

    $('.js-select').select2().on('change', function(){
      context.handleChange();
    });
  }

  componentDidUpdate(prevProps) {
    if (prevProps.AdGroup.details.id !== this.props.AdGroup.details.id ||
        prevProps.Campaign.details.id !== this.props.Campaign.details.id){
      bindFormValidators();

      $('.js-select').select2().on('change', function(){
        context.handleChange();
      });
    }
  }

  render() {
    let spinner;
    if(this.props.AdGroup.isSaving){
      spinner = <img src="/public/img/ajax-loader-aqua.gif" />;
    }

    const data = this.props.AdGroup.details;

    if(data.campaign_id === undefined){
      data.campaign_id = this.props.params.campaignId;
    }

    const categories = this.props.Init.categories.map((row, index) =>
        <option key={'categories-' + index} value={row}>{row}</option>
    );
    const channels = this.props.Init.channels.map((row, index) =>
        <option key={'channel-' + index} value={row.id}>{_.capitalize(row.name)}</option>
    );
    const locales = this.props.Init.locales.map((row, index) =>
        <option key={'locales-' + index} value={row}>{row}</option>
    );

    return (
      <div>
        <form id="AdGroupForm" ref="form" key={'adgroupform-' + ((this.props.editMode) ? 'edit-' + data.id : 'create-' + data.campaign_id )}>
          {(this.props.editMode) ? (<input type="hidden" id="AdGroupId" name="id" ref="id" value={data.id}/>) : null}
          <input type="hidden" name="campaign_id" ref="campaign_id" value={data.campaign_id} />
          <div className="container-fluid field-container">
            <div className="row">
              <div className="col-xs-4">
                {(this.props.editMode)
                  ? (<div className="form-group">
                  <label htmlFor="AdGroupPaused">Paused</label>
                  <div className="onoffswitch">
                    <input type="checkbox" onChange={this.handleChange} name="paused" ref="paused" className="onoffswitch-checkbox" id="AdGroupPaused" defaultChecked={data.paused} value="true"/>
                    <label className="onoffswitch-label" htmlFor="AdGroupPaused"></label>
                  </div>
                </div>)
                  : <input type="hidden" name="paused" ref="paused" value={false}/>
                }
              </div>
            </div>
            <div className="row">
              <div className="col-xs-4">
                <div className="form-group">
                  <label htmlFor="AdGroupName">Ad Group Name</label>
                  <input className="form-control" type="text" onChange={this.handleChange} id="AdGroupName" name="name" ref="name" defaultValue={data.name} data-parsley-required data-parsley-minlength="2"/>
                </div>
                {(this.props.AdGroup.details.type === 'suggested')
                  ? <div className="form-group">
                      <textarea className="form-control" onChange={this.handleChange} placeholder="Description" type="text" id="AdGroupExplanation" name="explanation" ref="explanation" defaultValue={data.explanation} />
                    </div>
                  : null
                }
              </div>
              <div className="col-xs-4 col-xs-push-3">
                <div className="form-group">
                  <label htmlFor="AdGroupType">Product Type</label>
                  <div className="switch-group">
                    <div className="switch-option switch-option-one">
                      Suggested
                    </div>
                    <div className="onoffswitch transparent">
                      <input type="checkbox" name="type" ref="type" onChange={this.handleSwitch} className="onoffswitch-checkbox" id="AdGroupType" defaultChecked={(data.type === 'suggested' || data.type === undefined) ? false : true} value="true"/>
                      <label className="onoffswitch-label" htmlFor="AdGroupType"></label>
                    </div>
                    <div className="switch-option switch-option-two">
                      Directory
                    </div>
                    <div className="clearfix" ></div>
                    {/*<div className="switch-copy" >
                     Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec cursus nulla et hendrerit mollis. Vivamus ullamcorper, lectus eget vestibulum placerat, leo erat ultrices tortor, eget tincidunt elit nulla sit amet metus.
                     </div>*/}
                  </div>
                </div>
              </div>
            </div>
            {(this.props.AdGroup.details.type === 'suggested' || this.props.editMode === false) ?
              (<div>
                  <hr/>
                  <div className="row">
                    <div className="col-xs-12">
                      <h3 className="form-section-header">Audience</h3>
                    </div>
                  </div>
               </div>)
              : null
            }

            <div className="row">
              <div className="col-xs-4">
              {(this.props.editMode === false) ?
                (<div>
                    <div className="form-group">
                      <label htmlFor="AdGroupChannelId">Channel</label>
                      <select className="form-control" onChange={this.handleChange} id="AdGroupChannelId" name="channel_id" ref="channel_id" defaultValue={data.channel_id} data-parsley-required >
                        {channels}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="AdGroupLocales">Locale</label><br/>
                      <select className="form-control js-select" onChange={this.handleChange} style={{width: '100%'}} id="AdGroupLocales" name="locale" ref="locale" defaultValue={data.locale} data-parsley-required>
                        <option></option>
                        {locales}
                      </select>
                    </div>
                </div>)
                : null
              }

                <div className={(this.props.AdGroup.details.type === 'directory')  ? 'hide' : '' }>
                  <div className="form-group">
                    <label htmlFor="AdGroupCategories">Categories</label><br/>
                    <select disabled={(this.props.AdGroup.details.type === 'directory')} onChange={this.handleChange} className="form-control js-select" style={{width: '100%'}} id="AdGroupCategories" name="categories[]" multiple="multiple" ref="categories" defaultValue={data.categories} data-parsley-required data-parsley-mincheck="1">
                      {categories}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            {(this.props.editMode === false) ?
              (<div className={(this.props.AdGroup.details.type === 'directory')  ? 'hide' : '' }>
                <hr/>
                <div className="row">
                  <div className="col-xs-12">
                    <h3 className="form-section-header">Budget</h3>
                  </div>
                </div>
                <div className="row">
                  <div className="col-xs-3">
                    <div className="form-group">
                      <label htmlFor="AdGroupFrequencyCapDaily">Frequency Cap Daily</label>
                      <input disabled={(this.props.AdGroup.details.type === 'directory')} onChange={this.handleChange} className="form-control" type="text" id="AdGroupFrequencyCapDaily" name="frequency_cap_daily" ref="frequency_cap_daily" defaultValue={data.frequency_cap_daily} data-parsley-type="number" data-parsley-required/>
                    </div>
                  </div>
                  <div className="col-xs-3">
                    <div className="form-group">
                      <label htmlFor="AdGroupFrequencyCapTotal">Frequency Cap Total</label>
                      <input disabled={(this.props.AdGroup.details.type === 'directory')} onChange={this.handleChange} className="form-control" type="text" id="AdGroupFrequencyCapTotal" name="frequency_cap_total" ref="frequency_cap_total" defaultValue={data.frequency_cap_total} data-parsley-type="number" data-parsley-required/>
                    </div>
                  </div>
                </div>
              </div>)
              : null
            }
          </div>

          <button onClick={this.handleFormSubmit} className="form-submit">Save {spinner}</button>
        </form>
      </div>
    );
  }

  handleChange(){
    if(this.props.App.formChanged !== true){
      this.props.dispatch(formChanged());
    }
  }

  handleSwitch(e){
    this.handleChange();

    let value = 'suggested';

    if($('#' + e.target.id).prop('checked') === true){
      value = 'directory';
    }
    this.props.dispatch(adGroupSetDetailsVar('type', value));
  }

  handleFormSubmit(e) {
    e.preventDefault();

    //Exclude validation of Select2 inputs.
    $('input.select2-search__field').attr('data-parsley-excluded', true);

    const form = $('#AdGroupForm').parsley();

    if(form.validate()){
      const formData = $('#AdGroupForm').serializeJSON();
      if(formData.type === undefined){
        formData.type = 'suggested';
      }
      else{
        formData.type = 'directory';
      }

      const data = JSON.stringify(formData);

      //Handle Update or Create
      if(this.props.editMode){
        this.handleUpdate(data);
      }
      else{
        this.handleCreate(data);
      }
    }
    else{
      const { dispatch } = this.props;
      dispatch(displayMessage('error', 'Validation Errors') );
      dispatch(shownMessage());
      window.scrollTo(0, 0);
    }
  }

  handleCreate(data){
    const { dispatch } = this.props;
    const context = this;

    dispatch(createAdGroup(data))
      .then(function(response){
        context.handleResponse(response);
      });
  }

  handleUpdate(data){
    const { dispatch } = this.props;
    const context = this;

    dispatch(updateAdGroup(this.props.AdGroup.details.id, data))
      .then(function(response){
        context.handleResponse(response);
      }
    );
  }

  handleResponse(response){
    const { dispatch, history } = this.props;

    if(response.result === undefined){
      dispatch(displayMessage('error', response.message) );
      dispatch(shownMessage());
      window.scrollTo(0, 0);
    }
    else{
      if(this.props.editMode){
        dispatch(displayMessage('success', 'Ad Group Updated Successfully') );
      }
      else{
        dispatch(displayMessage('success', 'Ad Group Created Successfully') );
      }
      dispatch(formSaved());
      history.pushState(null, '/adgroups/' + response.result.id);
    }
  }
}

AdGroupForm.propTypes = {
  AdGroup: PropTypes.object.isRequired,
  editMode: PropTypes.bool.isRequired
};
